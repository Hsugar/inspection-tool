const test = require('node:test');
const assert = require('node:assert/strict');
const { cameraLayout } = require('../.test-build/camera-layout.js');

for (const [label, viewport, sensor] of [
  ['portrait phone and portrait camera', [340, 440], [1920, 2560]],
  ['portrait phone and landscape camera', [340, 440], [2560, 1920]],
  ['landscape phone', [700, 210], [2560, 1920]],
  ['wide webcam', [660, 440], [1920, 1080]],
  ['very narrow camera feed', [660, 440], [240, 1920]],
]) {
  test(`camera geometry: ${label} keeps all pixels and the guide inside the visible image`, () => {
    const layout = cameraLayout(...viewport, ...sensor);
    assert.ok(layout);
    const { image, guide } = layout;
    const epsilon = 1e-8;
    assert.ok(Math.abs(image.width / image.height - sensor[0] / sensor[1]) < epsilon);
    assert.ok(image.left >= -epsilon && image.top >= -epsilon);
    assert.ok(image.left + image.width <= viewport[0] + epsilon);
    assert.ok(image.top + image.height <= viewport[1] + epsilon);
    assert.ok(guide.left >= image.left && guide.top >= image.top);
    assert.ok(guide.left + guide.width <= image.left + image.width);
    assert.ok(guide.top + guide.height <= image.top + image.height);
    assert.ok(Math.abs(guide.width / guide.height - 0.42) < epsilon);
    assert.ok(Math.abs(guide.left + guide.width / 2 - viewport[0] / 2) < epsilon);
    assert.ok(Math.abs(guide.top + guide.height / 2 - viewport[1] / 2) < epsilon);
  });
}

test('camera geometry is absent until valid video dimensions arrive', () => {
  for (const invalid of [0, -1, Infinity, NaN]) {
    assert.equal(cameraLayout(340, 440, invalid, 1920), null);
    assert.equal(cameraLayout(invalid, 440, 2560, 1920), null);
  }
});
