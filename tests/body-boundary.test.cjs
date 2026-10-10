const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const {
  analyzeDevice,
  orientDevice,
  rotateFrame,
} = require('../.test-build/device-vision.js');
const { conclude } = require('../.test-build/inspection.js');

// Visible outer-case bounds read from the original photos (including the lower
// rim), independently of the detector. The thumb occludes part of b-2's left edge.
const reference = {
  'b-1': [487, 711, 260, 677],
  'b-2': [418, 849, 309, 815],
  'b-3': [314, 761, 287, 697],
  'b-7': [532, 702, 255, 657],
};
async function frame(name, size = 1024, brightness = 1) {
  const { data, info } = await sharp(`test-img/${name}.jpg`)
    .resize({ width: size, height: size, fit: 'inside' })
    .modulate({ brightness })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
}
function expected(name, f) {
  const [x, y, width, height] = reference[name];
  return {
    x: (x * f.width) / 1280,
    y: (y * f.height) / 1700,
    width: (width * f.width) / 1280,
    height: (height * f.height) / 1700,
  };
}
function iou(a, b) {
  const intersection =
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return (
    intersection / (a.width * a.height + b.width * b.height - intersection)
  );
}
test('b-2 body follows all four outer edges including the lower rim', async () => {
  for (const [size, brightness] of [
    [768, 1],
    [1024, 1],
    [1536, 1],
    [1024, 0.65],
    [1024, 1.2],
  ]) {
    const f = await frame('b-2', size, brightness),
      target = expected('b-2', f);
    for (const angle of [0, 90, 180, 270]) {
      const r = orientDevice(rotateFrame(f, angle));
      assert.equal((r.rotation + angle) % 360, 0);
      assert.ok(
        iou(r.vision.body, target) > 0.95,
        `b-2 body overlap at ${size}, ${brightness}, ${angle}`,
      );
      const actual = r.vision.body;
      for (const error of [
        actual.x - target.x,
        actual.y - target.y,
        actual.x + actual.width - target.x - target.width,
        actual.y + actual.height - target.y - target.height,
      ])
        assert.ok(
          Math.abs(error) < target.width * 0.035,
          'each edge must fit the annotated case, not only the lamps',
        );
      assert.equal(conclude(r.vision).code, 'positive');
    }
  }
});
test('case boundary refinement also remains close on other coloured-case photos', async () => {
  for (const name of ['b-1', 'b-3', 'b-7']) {
    const f = await frame(name),
      r = orientDevice(f);
    assert.ok(iou(r.vision.body, expected(name, f)) > 0.9, name);
    assert.equal(conclude(r.vision).code, 'positive');
  }
});
test('manual body selection keeps the user rectangle and still identifies b-2 lamps', async () => {
  const f = await frame('b-2'),
    box = expected('b-2', f);
  const r = analyzeDevice(f, box);
  assert.deepEqual(r.body, box);
  assert.equal(r.localization, 'manual');
  assert.equal(conclude(r).code, 'positive');
});
