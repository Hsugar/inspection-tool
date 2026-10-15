import { Capacitor } from '@capacitor/core';
import type { Inspection } from './inspection';
import { confirmInspection } from './inspection';
import { normalizePatientInfo } from './patient';
import { InspectionNative, isAndroid, blobToBase64 } from './native';
type StoredRecord = { id: string; record: Inspection; original: Blob };
// Only records created during the active capture session may advance through
// processing. Loading history never grants mutation permission to old data.
const activeRecords = new Map<string, Inspection>();
let mutationQueue: Promise<unknown> = Promise.resolve();
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('jiantu-inspections', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('records', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
function recover(record: Inspection, image: string): Inspection {
  const interrupted = record.phase === 'reading' || record.phase === 'queued';
  return {
    ...record,
    image,
    displayImage:
      !record.displayImage ||
      (record.displayImage === record.thumbnail && !record.rotation)
        ? image
        : record.displayImage,
    ...(interrupted
      ? {
          phase: 'error' as const,
          error: '上次分析被中断，照片已保留。请返回首页重新录入并拍摄。',
        }
      : {}),
  };
}
export async function loadRecords(): Promise<{
  records: Inspection[];
  warnings: string[];
}> {
  await mutationQueue.catch(() => {});
  activeRecords.clear();
  if (isAndroid()) {
    const saved = await InspectionNative.listRecords();
    const records = saved.records.map((item) => {
      const record = JSON.parse(item.json) as Inspection;
      return recover(record, Capacitor.convertFileSrc(item.imageUri));
    });
    return {
      records: records.sort(
        (a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0),
      ),
      warnings: saved.errors,
    };
  }
  const database = await db();
  const saved = await new Promise<StoredRecord[]>((resolve, reject) => {
    const request = database
      .transaction('records')
      .objectStore('records')
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return {
    records: saved
      .map((item) => {
        return recover(item.record, URL.createObjectURL(item.original));
      })
      .sort((a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0)),
    warnings: [],
  };
}
function sameData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object')
    return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  const keysA = Object.keys(a).filter((key) => a[key] !== undefined);
  const keysB = Object.keys(b).filter((key) => b[key] !== undefined);
  return (
    keysA.length === keysB.length &&
    keysA.every((key) => sameData(a[key], b[key]))
  );
}
function validateTransition(record: Inspection, previous?: Inspection) {
  if (!record.id) throw new Error('记录编号不能为空');
  if (!previous) {
    if (
      record.phase !== 'queued' ||
      record.lockedAt ||
      record.confirmedAt ||
      record.reviewed
    )
      throw new Error('新检测必须从待处理照片开始');
    if (!record.patient) throw new Error('请先完整录入患者信息');
    normalizePatientInfo(record.patient);
    return;
  }
  if (previous.lockedAt) throw new Error('检测记录已保存，只能查看和导出');
  for (const key of [
    'patient',
    'name',
    'image',
    'createdAt',
    'createdTimestamp',
  ] as const)
    if (!sameData(previous[key], record[key]))
      throw new Error('检测信息不能修改');
  if (previous.phase === 'done' || previous.phase === 'error') {
    if (!record.lockedAt || !record.confirmedAt)
      throw new Error('已完成的检测只能确认保存，不能修改');
    const expected = confirmInspection(previous, new Date(record.confirmedAt));
    if (!sameData(record, expected))
      throw new Error('确认保存不能修改检测信息');
  } else {
    if (record.lockedAt || record.confirmedAt || record.reviewed)
      throw new Error('请先完成照片处理，再确认保存');
    if (previous.phase === 'reading' && record.phase === 'queued')
      throw new Error('检测处理阶段不能回退');
  }
}

/** Serializes saves so a slow image write cannot overwrite a final result. */
export function saveRecord(record: Inspection): Promise<void> {
  const snapshot = structuredClone(record);
  const operation = mutationQueue.then(() => persistRecord(snapshot));
  mutationQueue = operation.catch(() => {});
  return operation;
}

async function persistRecord(record: Inspection) {
  const previous = activeRecords.get(record.id);
  validateTransition(record, previous);
  const clean = {
    ...record,
    image: '',
    displayImage:
      record.displayImage === record.image ? '' : record.displayImage,
  };
  if (isAndroid()) {
    // Native putRecord independently rejects existing historical IDs and
    // validates the same state transition. Do not call listRecords here:
    // listing history intentionally closes any active capture session.
    const imageBase64 = previous
      ? undefined
      : await blobToBase64(await (await fetch(record.image)).blob());
    await InspectionNative.putRecord({
      id: record.id,
      json: JSON.stringify(clean),
      imageBase64,
    });
  } else {
    const database = await db();
    const original = previous
      ? undefined
      : await (await fetch(record.image)).blob();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      const request = store.get(record.id);
      let failure: Error | undefined;
      request.onsuccess = () => {
        if ((!previous && request.result) || (previous && !request.result)) {
          failure = new Error('历史检测记录不能修改');
          tx.abort();
          return;
        }
        if (
          previous &&
          !sameData(request.result.record, {
            ...previous,
            image: '',
            displayImage:
              previous.displayImage === previous.image
                ? ''
                : previous.displayImage,
          })
        ) {
          failure = new Error('检测记录已在其他窗口保存，请查看历史记录');
          tx.abort();
          return;
        }
        store.put(
          original
            ? { id: record.id, record: clean, original }
            : { ...request.result, record: clean },
        );
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(failure || tx.error || new Error('本地保存失败'));
    });
  }
  activeRecords.set(record.id, record);
}
export async function deleteRecord(_id: string): Promise<never> {
  throw new Error('检测记录不能删除，只能查看和导出');
}
