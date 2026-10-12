const test = require('node:test');
const assert = require('node:assert/strict');
const filesystem = require('@capacitor/filesystem');
const native = require('../.test-build/native.js');
const { exportAndroidFile } = require('../.test-build/mobile-export.js');

function mockBridge(t, overrides = {}) {
  const calls = [];
  const writes = [];
  const removed = [];
  const original = { filesystem: filesystem.Filesystem, native: native.InspectionNative, base64: native.blobToBase64 };
  filesystem.Filesystem = {
    writeFile: async (options) => {
      writes.push(options);
      return { uri: `file:///data/cache/${options.path}` };
    },
    readdir: async () => ({ files: [
      { name: 'old.csv', mtime: Date.now() - 2 * 86400000 },
      { name: 'recent.csv', mtime: Date.now() },
    ] }),
    deleteFile: async (options) => { removed.push(options.path); },
    ...overrides.filesystem,
  };
  native.InspectionNative = {
    saveExport: async (options) => { calls.push({ action: 'save', ...options }); return { cancelled: false }; },
    shareExport: async (options) => { calls.push({ action: 'share', ...options }); return { cancelled: false }; },
    ...overrides.native,
  };
  native.blobToBase64 = async (blob) => Buffer.from(await blob.arrayBuffer()).toString('base64');
  t.after(() => {
    filesystem.Filesystem = original.filesystem;
    native.InspectionNative = original.native;
    native.blobToBase64 = original.base64;
  });
  return { calls, writes, removed };
}

test('Android save and share preserve each format MIME, file name and bytes', async (t) => {
  const { calls, writes, removed } = mockBridge(t);
  const formats = [
    ['检图_fhir-json_test.json', 'application/fhir+json'],
    ['检图_fhir-xml_test.xml', 'application/fhir+xml'],
    ['检图_test.csv', 'text/csv'],
    ['检图_test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ];
  const bytes = new Uint8Array([0, 239, 187, 191, 255, 10]);
  for (const [name, mimeType] of formats) {
    for (const action of ['save', 'share']) {
      await exportAndroidFile(new Blob([bytes]), name, mimeType, action);
      assert.deepEqual(calls.at(-1), { action, name, mimeType, path: `file:///data/cache/exports/${name}` });
      const write = writes.at(-1);
      assert.equal(write.directory, filesystem.Directory.Cache);
      assert.equal(write.path, `exports/${name}`);
      assert.deepEqual(Buffer.from(write.data, 'base64'), Buffer.from(bytes));
    }
  }
  assert.equal(removed.length, 8);
  assert.ok(removed.every((name) => name === 'exports/old.csv'));
});

test('Android normal save/share cancellation is a status, while native errors propagate', async (t) => {
  mockBridge(t, { native: {
    saveExport: async () => ({ cancelled: true }),
    shareExport: async () => ({ cancelled: true }),
  } });
  const blob = new Blob(['<Bundle/>']);
  assert.equal(await exportAndroidFile(blob, 'record.xml', 'application/fhir+xml', 'save'), '已取消保存');
  assert.equal(await exportAndroidFile(blob, 'record.xml', 'application/fhir+xml', 'share'), '已取消分享');
  native.InspectionNative.shareExport = async () => { throw new Error('receiver unavailable'); };
  await assert.rejects(exportAndroidFile(blob, 'record.xml', 'application/fhir+xml', 'share'), /receiver unavailable/);
  native.InspectionNative.saveExport = async () => { throw new Error('provider close failed'); };
  await assert.rejects(exportAndroidFile(blob, 'record.xml', 'application/fhir+xml', 'save'), /provider close failed/);
});

test('Android cache cleanup failure is harmless but export write failure prevents native delivery', async (t) => {
  const { calls } = mockBridge(t, { filesystem: {
    readdir: async () => { throw new Error('cache unavailable'); },
  } });
  const blob = new Blob(['{}']);
  await exportAndroidFile(blob, 'record.json', 'application/fhir+json', 'share');
  assert.equal(calls.length, 1);
  filesystem.Filesystem.writeFile = async () => { throw new Error('disk full'); };
  await assert.rejects(exportAndroidFile(blob, 'record.json', 'application/fhir+json', 'share'), /disk full/);
  assert.equal(calls.length, 1);
});
