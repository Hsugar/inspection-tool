const test = require('node:test');
const assert = require('node:assert/strict');
const { Capacitor } = require('@capacitor/core');
const native = require('../.test-build/native.js');

function mockPhotos(t, photos = [], overrides = {}) {
  const requests = [];
  const reads = [];
  let cleanupCount = 0;
  const original = {
    bridge: native.InspectionNative,
    fetch: global.fetch,
    convert: Capacitor.convertFileSrc,
  };
  native.InspectionNative = {
    pickPhotos: async (options) => {
      requests.push(options);
      return { photos };
    },
    clearImports: async () => {
      cleanupCount++;
      if (overrides.cleanupError) throw overrides.cleanupError;
    },
  };
  Capacitor.convertFileSrc = (path) => `https://localhost/files/${path}`;
  global.fetch = async (url) => {
    reads.push(url);
    return overrides.fetch
      ? overrides.fetch(url)
      : new Response(new Uint8Array([0, 1, 255]));
  };
  t.after(() => {
    native.InspectionNative = original.bridge;
    global.fetch = original.fetch;
    Capacitor.convertFileSrc = original.convert;
  });
  return { requests, reads, cleanupCount: () => cleanupCount };
}

const first = { path: 'first', name: '设备照片.png', type: 'image/png' };
const second = { path: 'second', name: 'second.jpg', type: 'image/jpeg' };

test('Android explicit single selection preserves bytes and metadata before clearing imports', async (t) => {
  const mock = mockPhotos(t, [first]);
  const files = await native.pickAndroidPhotos({ multiple: false });
  assert.deepEqual(mock.requests, [{ multiple: false }]);
  assert.deepEqual(mock.reads, ['https://localhost/files/first']);
  assert.equal(files.length, 1);
  assert.equal(files[0].name, first.name);
  assert.equal(files[0].type, first.type);
  assert.deepEqual(new Uint8Array(await files[0].arrayBuffer()), new Uint8Array([0, 1, 255]));
  assert.equal(mock.cleanupCount(), 1);
});

test('Android omitted picker options retain multi-photo behavior', async (t) => {
  const mock = mockPhotos(t, [first, second]);
  const files = await native.pickAndroidPhotos();
  assert.deepEqual(mock.requests, [undefined]);
  assert.deepEqual(files.map((file) => file.name), [first.name, second.name]);
  assert.equal(mock.cleanupCount(), 1);
});

test('Android picker cancellation returns no files and clears temporary imports', async (t) => {
  const mock = mockPhotos(t);
  assert.deepEqual(await native.pickAndroidPhotos({ multiple: false }), []);
  assert.deepEqual(mock.reads, []);
  assert.equal(mock.cleanupCount(), 1);
});

test('Android photo fetch failure rejects the batch and clears imports', async (t) => {
  const mock = mockPhotos(t, [first, second], {
    fetch: (url) => url.endsWith('/second')
      ? new Response(null, { status: 404 })
      : new Response('first photo'),
  });
  await assert.rejects(native.pickAndroidPhotos(), /无法读取所选照片/);
  assert.equal(mock.reads.length, 2);
  assert.equal(mock.cleanupCount(), 1);
});

test('Android photo read error is not hidden by a second cleanup failure', async (t) => {
  const readError = new Error('photo connection failed');
  const mock = mockPhotos(t, [first], {
    fetch: () => { throw readError; },
    cleanupError: new Error('cleanup failed'),
  });
  await assert.rejects(native.pickAndroidPhotos({ multiple: false }), (error) => error === readError);
  assert.equal(mock.cleanupCount(), 1);
});

test('Android cleanup failure after successful reading remains visible', async (t) => {
  const mock = mockPhotos(t, [first], { cleanupError: new Error('cleanup failed') });
  await assert.rejects(native.pickAndroidPhotos({ multiple: false }), /cleanup failed/);
  assert.equal(mock.cleanupCount(), 1);
});
