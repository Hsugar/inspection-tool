require('fake-indexeddb/auto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { saveRecord, loadRecords, deleteRecord } = require('../.test-build/record-store.js');
const { emptyDevice, confirmInspection } = require('../.test-build/inspection.js');
const { emptyPatientInfo, normalizePatientInfo, validatePatientInfo, TEST_ITEMS } = require('../.test-build/patient.js');
const patient = { name: '测试患者', gender: 'female', age: '30', patientId: '0001', contact: '00123456789', testItem: 'MTB' };
function pending(id) {
  const image = URL.createObjectURL(new Blob(['original-photo-bytes'], { type: 'image/jpeg' }));
  return {
    id, name: 'photo.jpg', image, displayImage: image, thumbnail: 'data:image/jpeg;base64,eA==',
    thumbnailWidth: 1, thumbnailHeight: 1, barcode: '', format: '', barcodeBox: null,
    barcodeSource: 'unread', device: emptyDevice(), imageWidth: 10, imageHeight: 10,
    rotation: 0, elapsedMs: 0, phase: 'queued', error: '', reviewed: false,
    createdAt: '2026-10-13T01:00:00.000Z', patient: { ...patient },
  };
}
function complete(record) {
  const device = emptyDevice();
  device.body = { x: 0, y: 0, width: 100, height: 200 };
  device.lamps = device.lamps.map((lamp) => ({ ...lamp, state: lamp.key === 'positive' ? 'on' : 'off' }));
  return { ...record, phase: 'done', barcode: '001234', barcodeSource: 'decoded', device };
}

test('patient entry requires six fields, accepts only seven projects, and starts independently every time', () => {
  assert.equal(Object.keys(validatePatientInfo(emptyPatientInfo())).length, 6);
  assert.deepEqual(TEST_ITEMS, ['MTB', 'GBS', 'Flu A', 'Flu B', 'NG', 'MG', 'CT']);
  for (const age of ['', '-1', '151', '1.5', '1e2', 'NaN']) assert.ok(validatePatientInfo({ ...patient, age }).age);
  for (const age of ['0', '150', ' 030 ']) assert.equal(validatePatientInfo({ ...patient, age }).age, undefined);
  assert.equal(normalizePatientInfo({ ...patient, name: ' 测试 ', age: '030' }).age, '30');
  assert.ok(validatePatientInfo({ ...patient, contact: '  ' }).contact);
  assert.ok(validatePatientInfo({ ...patient, testItem: 'COVID' }).testItem);
  const first = emptyPatientInfo();
  first.name = '上一个患者';
  assert.equal(emptyPatientInfo().name, '');
});

test('queued saves serialize processing and confirmation while preserving original bytes and immutable metadata', async () => {
  const record = pending('workflow');
  const done = complete(record);
  await Promise.all([saveRecord(record), saveRecord({ ...record, phase: 'reading' }), saveRecord(done)]);
  await assert.rejects(saveRecord({ ...done, patient: { ...patient, name: 'changed' } }), /不能修改/);
  await assert.rejects(saveRecord({ ...done, barcode: 'changed' }), /只能确认/);
  const confirmed = confirmInspection(done, new Date('2026-10-13T01:01:00.000Z'));
  assert.equal(confirmed.reviewed, true);
  await saveRecord(confirmed);
  await assert.rejects(saveRecord({ ...confirmed, reviewed: false }), /只能查看和导出/);
  await assert.rejects(deleteRecord(record.id), /不能删除/);
  URL.revokeObjectURL(record.image);
  const restored = (await loadRecords()).records.find((r) => r.id === record.id);
  assert.equal(await (await fetch(restored.image)).text(), 'original-photo-bytes');
  assert.equal(restored.displayImage, restored.image);
  assert.equal(restored.barcode, '001234');
  assert.equal(restored.confirmedAt, confirmed.confirmedAt);
  assert.deepEqual(restored.patient, patient);
  await assert.rejects(saveRecord({ ...restored, phase: 'queued', lockedAt: undefined, confirmedAt: undefined, reviewed: false }), /历史检测记录不能修改/);
  URL.revokeObjectURL(restored.image);
});

test('uncertain and failed results lock without being promoted to confirmed indications', async () => {
  for (const phase of ['done', 'error']) {
    const queued = pending(`uncertain-${phase}`);
    await saveRecord(queued);
    const finished = { ...queued, phase, error: phase === 'error' ? 'Worker failed' : '' };
    await saveRecord(finished);
    const confirmed = confirmInspection(finished);
    assert.equal(confirmed.reviewed, false);
    assert.ok(confirmed.lockedAt);
    await saveRecord(confirmed);
    await assert.rejects(saveRecord({ ...confirmed, phase: 'reading' }), /只能查看和导出/);
    URL.revokeObjectURL(queued.image);
  }
});

test('interrupted history remains readable and cannot resume or delete the saved evidence', async () => {
  const record = pending('interrupted');
  await saveRecord(record);
  await saveRecord({ ...record, phase: 'reading' });
  URL.revokeObjectURL(record.image);
  const restored = (await loadRecords()).records.find((r) => r.id === record.id);
  assert.equal(restored.phase, 'error');
  assert.match(restored.error, /中断/);
  assert.equal(await (await fetch(restored.image)).text(), 'original-photo-bytes');
  await assert.rejects(saveRecord({ ...restored, phase: 'queued' }), /历史检测记录不能修改/);
  await assert.rejects(deleteRecord(record.id), /不能删除/);
  URL.revokeObjectURL(restored.image);
});

test('a fresh record cannot bypass patient entry or start as an already confirmed result', async () => {
  const record = pending('invalid-workflow');
  await assert.rejects(saveRecord({ ...record, patient: undefined }), /录入患者信息/);
  await assert.rejects(saveRecord({ ...record, phase: 'done', reviewed: true }), /待处理照片/);
  assert.throws(() => confirmInspection(record), /处理完成/);
  URL.revokeObjectURL(record.image);
});

test('a stale capture session cannot overwrite a result saved by another browser window', async () => {
  const queued = pending('other-window');
  await saveRecord(queued);
  const external = confirmInspection(complete(queued));
  await new Promise((resolve, reject) => {
    const open = indexedDB.open('jiantu-inspections', 1);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      const get = store.get(queued.id);
      get.onsuccess = () => store.put({ ...get.result, record: { ...external, image: '', displayImage: '' } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  });
  await assert.rejects(saveRecord({ ...queued, phase: 'reading' }), /其他窗口保存/);
  const restored = (await loadRecords()).records.find((r) => r.id === queued.id);
  assert.equal(restored.reviewed, true);
  assert.equal(restored.lockedAt, external.lockedAt);
  URL.revokeObjectURL(queued.image);
  URL.revokeObjectURL(restored.image);
});
