import { Capacitor } from '@capacitor/core';
import type { Inspection } from './inspection';
import { InspectionNative, isAndroid, blobToBase64 } from './native';
type StoredRecord = { id: string; record: Inspection; original: Blob };
const storedIds = new Set<string>();
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
          error: '上次分析被中断，照片已保存，请点击重新分析。',
        }
      : {}),
  };
}
export async function loadRecords(): Promise<{
  records: Inspection[];
  warnings: string[];
}> {
  storedIds.clear();
  if (isAndroid()) {
    const saved = await InspectionNative.listRecords();
    const records = saved.records.map((item) => {
      const record = JSON.parse(item.json) as Inspection;
      storedIds.add(record.id);
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
        storedIds.add(item.id);
        return recover(item.record, URL.createObjectURL(item.original));
      })
      .sort((a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0)),
    warnings: [],
  };
}
export async function saveRecord(record: Inspection) {
  const clean = {
    ...record,
    image: '',
    displayImage:
      record.displayImage === record.image ? '' : record.displayImage,
  };
  if (isAndroid()) {
    const imageBase64 = storedIds.has(record.id)
      ? undefined
      : await blobToBase64(await (await fetch(record.image)).blob());
    await InspectionNative.putRecord({
      id: record.id,
      json: JSON.stringify(clean),
      imageBase64,
    });
  } else {
    const database = await db();
    const original = storedIds.has(record.id)
      ? undefined
      : await (await fetch(record.image)).blob();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      if (original) store.put({ id: record.id, record: clean, original });
      else {
        const request = store.get(record.id);
        request.onsuccess = () => {
          if (!request.result) {
            tx.abort();
            return;
          }
          store.put({ ...request.result, record: clean });
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(tx.error || new Error('本地保存失败'));
    });
  }
  storedIds.add(record.id);
}
export async function deleteRecord(id: string) {
  if (isAndroid()) await InspectionNative.deleteRecord({ id });
  else {
    const database = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('records', 'readwrite');
      tx.objectStore('records').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  storedIds.delete(id);
}
