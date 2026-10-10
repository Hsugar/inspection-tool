require('fake-indexeddb/auto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { saveRecord, loadRecords, deleteRecord } = require('../.test-build/record-store.js');
const { emptyDevice } = require('../.test-build/inspection.js');
test('persistent records retain original bytes, edited result, interrupted state and deletion', async () => {
  const original = new Blob(['original-photo-bytes'], { type: 'image/jpeg' });
  const image = URL.createObjectURL(original);
  const record = {
    id: 'persistence-test', name: 'photo.jpg', image, displayImage: image, thumbnail: 'data:image/jpeg;base64,eA==',
    thumbnailWidth: 1, thumbnailHeight: 1, barcode: '', format: '', barcodeBox: null,
    barcodeSource: 'unread', device: emptyDevice(), imageWidth: 10, imageHeight: 10,
    rotation: 0, elapsedMs: 0, phase: 'reading', error: '', reviewed: false, createdAt: '2026-09-07',
  };
  await saveRecord(record);
  URL.revokeObjectURL(image);
  let restored = (await loadRecords()).records[0];
  assert.equal(await (await fetch(restored.image)).text(), 'original-photo-bytes');
  assert.equal(restored.displayImage, restored.image);
  assert.equal(restored.phase, 'error');
  assert.match(restored.error, /中断/);
  await saveRecord({ ...restored, displayImage: restored.thumbnail, phase: 'error', error: 'Worker failed' });
  URL.revokeObjectURL(restored.image);
  restored = (await loadRecords()).records[0];
  assert.equal(restored.displayImage, restored.image, 'legacy failed records show the original, not a stretched 240px thumbnail');
  assert.equal(restored.error, 'Worker failed');
  await saveRecord({ ...restored, barcode: '001234', phase: 'done', reviewed: true, displayImage: 'data:image/jpeg;base64,YQ==' });
  URL.revokeObjectURL(restored.image);
  restored = (await loadRecords()).records[0];
  assert.equal(restored.barcode, '001234');
  assert.equal(restored.reviewed, true);
  assert.equal(restored.displayImage, 'data:image/jpeg;base64,YQ==');
  assert.equal(await (await fetch(restored.image)).text(), 'original-photo-bytes');
  URL.revokeObjectURL(restored.image);
  await deleteRecord(record.id);
  assert.equal((await loadRecords()).records.length, 0);
});
