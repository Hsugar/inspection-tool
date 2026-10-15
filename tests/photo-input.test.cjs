const test = require('node:test');
const assert = require('node:assert/strict');
const { PHOTO_ACCEPT, validatePhotoFile } = require('../.test-build/photo-input.js');

const maxBytes = 20 * 1024 * 1024;

test('photo picker accepts the same JPEG, PNG and WebP formats as validation', () => {
  assert.equal(PHOTO_ACCEPT, 'image/jpeg,image/png,image/webp');
  for (const type of PHOTO_ACCEPT.split(',')) {
    assert.equal(validatePhotoFile({ type, size: 1 }), null, type);
  }
});

test('unsupported or missing MIME types are rejected before size validation', () => {
  for (const type of ['image/gif', 'image/heic', 'application/pdf', '']) {
    for (const size of [0, 1, maxBytes + 1]) {
      assert.equal(validatePhotoFile({ type, size }), 'type', `${type}: ${size}`);
    }
  }
});

test('empty files are rejected for every supported photo format', () => {
  for (const type of PHOTO_ACCEPT.split(',')) {
    assert.equal(validatePhotoFile({ type, size: 0 }), 'empty', type);
  }
});

test('20 MiB is accepted and one byte above the limit is rejected', () => {
  for (const type of PHOTO_ACCEPT.split(',')) {
    assert.equal(validatePhotoFile({ type, size: maxBytes - 1 }), null, type);
    assert.equal(validatePhotoFile({ type, size: maxBytes }), null, type);
    assert.equal(validatePhotoFile({ type, size: maxBytes + 1 }), 'size', type);
  }
});
