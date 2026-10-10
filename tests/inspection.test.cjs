const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { prepareZXingModule } = require('zxing-wasm/reader');
const {
  analyzeDevice,
  orientDevice,
  rotateFrame,
  measureLamp,
  resolveResultLamps,
} = require('../.test-build/device-vision.js');
const { decodeBarcode } = require('../.test-build/barcode.js');
const {
  conclude,
  emptyDevice,
  setManualLampState,
  needsReview,
} = require('../.test-build/inspection.js');
const { createWorkbook } = require('../.test-build/export.js');
prepareZXingModule({
  overrides: {
    wasmBinary: fs.readFileSync('public/barcode/zxing_reader.wasm'),
  },
});
async function pixels(file, size = 1024, rotation = 0) {
  const { data, info } = await sharp(file)
    .rotate(rotation)
    .resize({ width: size, height: size, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
}
const expected = {
  'a-1': {
    barcode: '01202609030006',
    states: ['off', 'off', 'on', 'off'],
    code: 'invalid',
  },
  'a-2': {
    barcode: '01202609030005',
    states: ['off', 'on', 'off', 'off'],
    code: 'positive',
  },
};
const records = [];
for (const [name, want] of Object.entries(expected))
  test(`${name}: real image barcode, body and four lamps`, async () => {
    const file = `test-img/${name}.jpg`;
    const frame = await pixels(file);
    const { vision, rotation } = orientDevice(frame);
    const barcode = await decodeBarcode(await pixels(file, 4096));
    assert.equal(rotation, 0);
    assert.equal(barcode.barcode, want.barcode);
    assert.equal(barcode.format, 'Code128');
    assert.ok(barcode.box.width > 0 && barcode.box.height > 0);
    assert.ok(vision.body);
    assert.deepEqual(
      vision.lamps.map((l) => l.state),
      want.states,
    );
    assert.equal(conclude(vision).code, want.code);
    assert.deepEqual(conclude(vision).warnings, []);
    assert.equal(
      vision.lamps[want.code === 'invalid' ? 2 : 1].color,
      want.code === 'invalid' ? 'amber' : 'red',
    );
    fs.mkdirSync('test-output/device', { recursive: true });
    fs.writeFileSync(
      `test-output/device/${name}.json`,
      JSON.stringify(
        { width: frame.width, height: frame.height, ...vision, barcode },
        null,
        2,
      ),
    );
    await sharp(Buffer.from(frame.data), {
      raw: { width: frame.width, height: frame.height, channels: 4 },
    })
      .png()
      .toFile(`test-output/device/${name}.png`);
    const thumb = await sharp(file)
      .resize({ width: 180, height: 240, fit: 'inside' })
      .jpeg()
      .toBuffer();
    records.push({
      id: name,
      name: `${name}.jpg`,
      image: '',
      displayImage: '',
      thumbnail: 'data:image/jpeg;base64,' + thumb.toString('base64'),
      thumbnailWidth: 180,
      thumbnailHeight: 240,
      barcode: barcode.barcode,
      format: barcode.format,
      barcodeBox: barcode.box,
      barcodeSource: 'decoded',
      device: vision,
      imageWidth: frame.width,
      imageHeight: frame.height,
      rotation: 0,
      elapsedMs: 1,
      phase: 'done',
      error: '',
      reviewed: false,
      createdAt: '2026/09/07',
    });
  });
test('same photos at different image rotations retain all lamp states', async () => {
  for (const [name, want] of Object.entries(expected)) {
    const frame = await pixels(`test-img/${name}.jpg`);
    for (const angle of [90, 180, 270]) {
      const result = orientDevice(rotateFrame(frame, angle));
      assert.deepEqual(
        result.vision.lamps.map((l) => l.state),
        want.states,
        `${name} rotation ${angle}`,
      );
      assert.equal((result.rotation + angle) % 360, 0);
    }
  }
});
test('resizing and moderate exposure changes do not confuse reflection with Negative', async () => {
  for (const [name, want] of Object.entries(expected)) {
    for (const size of [768, 1280]) {
      const frame = await pixels(`test-img/${name}.jpg`, size);
      assert.deepEqual(
        analyzeDevice(frame).lamps.map((l) => l.state),
        want.states,
        `${name} size ${size}`,
      );
    }
    const frame = await pixels(`test-img/${name}.jpg`);
    for (let i = 0; i < frame.data.length; i++)
      if (i % 4 !== 3) frame.data[i] = Math.round(frame.data[i] * 0.8);
    assert.deepEqual(
      analyzeDevice(frame).lamps.map((l) => l.state),
      want.states,
      `${name} darker`,
    );
  }
});
test('reported pale green lamp is ON across exposure, resizing and JPEG compression', async () => {
  // User supplied an annotated screenshot, not the original photo. This crop
  // tests lamp classification only; the annotation border has no green signal.
  for (const size of [25, 33, 42]) {
    for (const brightness of [1, 0.8]) {
      const { data, info } = await sharp(
        'tests/fixtures/negative-green-reference.png',
      )
        .resize(size, size)
        .modulate({ brightness })
        .jpeg({ quality: 85 })
        .toBuffer()
        .then((buffer) =>
          sharp(buffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true }),
        );
      const frame = { data, width: info.width, height: info.height };
      const lamp = measureLamp(frame, 'negative', {
        x: 0,
        y: 0,
        width: size,
        height: size,
      });
      assert.equal(lamp.state, 'on', `size ${size}, brightness ${brightness}`);
      assert.equal(lamp.color, 'green');
      const device = emptyDevice();
      device.body = lamp.box;
      device.lamps.forEach((l) => (l.state = 'off'));
      device.lamps[0] = lamp;
      assert.equal(conclude(device).code, 'negative');
    }
  }
});
test('white glare, cyan, dim green and scattered green speckles stay OFF', () => {
  const size = 40,
    box = { x: 0, y: 0, width: size, height: size };
  for (const [name, color, scattered] of [
    ['white glare', [245, 250, 245], false],
    ['cyan reflection', [60, 190, 190], false],
    ['dim green', [40, 115, 45], false],
    ['green noise', [70, 190, 75], true],
  ]) {
    const data = new Uint8ClampedArray(size * size * 4).fill(50);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (
          scattered
            ? x % 4 === 0 && y % 4 === 0
            : x > 12 && x < 26 && y > 12 && y < 26
        )
          data.set(color, (y * size + x) * 4);
        data[(y * size + x) * 4 + 3] = 255;
      }
    assert.equal(
      measureLamp({ data, width: size, height: size }, 'negative', box).state,
      'off',
      name,
    );
  }
});
test('unknown input and any contradictory result lamps never become a definite result', () => {
  const empty = analyzeDevice({
    width: 300,
    height: 400,
    data: new Uint8ClampedArray(300 * 400 * 4),
  });
  assert.equal(empty.body, null);
  assert.equal(empty.lamps.length, 4);
  assert.equal(conclude(empty).code, 'unknown');
  const device = emptyDevice();
  device.body = { x: 0, y: 0, width: 100, height: 260 };
  device.lamps.forEach((l) => (l.state = 'off'));
  assert.equal(conclude(device).code, 'unknown');
  device.lamps[0].state = 'on';
  device.lamps[1].state = 'on';
  assert.equal(conclude(device).code, 'conflict');
  device.lamps[2].state = 'on';
  assert.equal(conclude(device).code, 'conflict');
  device.lamps[0].state = 'off';
  assert.equal(conclude(device).code, 'conflict');
  device.lamps[1].state = 'off';
  assert.equal(conclude(device).code, 'invalid');
});
test('reported Positive light beats Negative spill in unannotated lamp interiors', async () => {
  const measured = [];
  for (const key of ['negative', 'positive']) {
    const frame = await pixels(
      `tests/fixtures/spill-${key}.png`,
      key === 'negative' ? 18 : 17,
    );
    measured.push(
      measureLamp(frame, key, {
        x: 0,
        y: 0,
        width: frame.width,
        height: frame.height,
      }),
    );
  }
  assert.deepEqual(
    measured.map((l) => l.state),
    ['on', 'on'],
    'reproduces the independent threshold failure',
  );
  const device = emptyDevice();
  device.body = measured[0].box;
  device.lamps = [
    ...measured,
    ...device.lamps.slice(2).map((l) => ({ ...l, state: 'off' })),
  ];
  device.lamps = resolveResultLamps(device.lamps);
  assert.deepEqual(
    device.lamps.map((l) => l.state),
    ['off', 'on', 'off', 'off'],
  );
  assert.match(device.lamps[0].reason, /串光/);
  assert.equal(conclude(device).code, 'positive');
});
test('mutual exclusion works for each result lamp; ambiguous light stays unknown; Power is independent', () => {
  const baseline = emptyDevice().lamps.map((l) => ({
    ...l,
    box: { x: 0, y: 0, width: 40, height: 40 },
    state: 'on',
    color: 'red',
    brightPixels: 45,
    signal: 90,
    peak: 255,
  }));
  for (let winner = 0; winner < 3; winner++) {
    const lamps = baseline.map((l, i) => ({
      ...l,
      brightPixels: i === winner ? 400 : i === 3 ? 1000 : 45,
    }));
    const result = resolveResultLamps(lamps);
    assert.deepEqual(
      result.map((l) => l.state),
      [0, 1, 2, 3].map((i) => (i === winner || i === 3 ? 'on' : 'off')),
    );
    assert.deepEqual(result[3], lamps[3]);
    assert.equal(lamps[0].state, 'on', 'raw measurements are not mutated');
  }
  const tied = resolveResultLamps(baseline);
  assert.deepEqual(
    tied.map((l) => l.state),
    ['unknown', 'unknown', 'unknown', 'on'],
  );
  assert.equal(
    conclude({ ...emptyDevice(), body: baseline[0].box, lamps: tied }).code,
    'unknown',
  );
  const allOff = baseline.map((l) => ({ ...l, state: 'off' }));
  assert.deepEqual(
    resolveResultLamps(allOff),
    allOff,
    'do not invent a result when no lamp is lit',
  );
});
test('manual result selection clears the other two result lamps, leaving Power unchanged', () => {
  let device = emptyDevice();
  device.body = { x: 0, y: 0, width: 100, height: 250 };
  device = setManualLampState(device, 'power', 'on');
  for (const key of ['negative', 'positive', 'invalid']) {
    device = setManualLampState(device, key, 'on');
    assert.equal(
      device.lamps.filter((l) => l.key !== 'power' && l.state === 'on').length,
      1,
    );
    assert.equal(device.lamps.find((l) => l.key === 'power').state, 'on');
    assert.equal(conclude(device).code, key);
  }
  device = setManualLampState(device, 'power', 'unknown');
  assert.equal(conclude(device).code, 'invalid');
  assert.deepEqual(conclude(device).warnings, []);
});
test('Power on, off, unknown or absent never changes any result or review decision', () => {
  for (const negative of ['on', 'off', 'unknown'])
    for (const positive of ['on', 'off', 'unknown'])
      for (const invalid of ['on', 'off', 'unknown']) {
        const device = emptyDevice();
        device.body = { x: 0, y: 0, width: 100, height: 250 };
        const states = { negative, positive, invalid };
        device.lamps = device.lamps
          .filter((l) => l.key !== 'power')
          .map((l) => ({ ...l, state: states[l.key] }));
        const expected = conclude(device);
        assert.deepEqual(expected.warnings, []);
        for (const state of ['on', 'off', 'unknown']) {
          const withPower = {
            ...device,
            lamps: [...device.lamps, { ...emptyDevice().lamps[3], state }],
          };
          assert.deepEqual(conclude(withPower), expected);
          for (const reviewed of [false, true]) {
            const record = { device, reviewed, barcode: '01202609030005' };
            assert.equal(
              needsReview({ ...record, device: withPower }),
              needsReview(record),
            );
          }
        }
      }
  const incomplete = emptyDevice();
  incomplete.body = { x: 0, y: 0, width: 100, height: 250 };
  incomplete.lamps = incomplete.lamps
    .filter((l) => l.key !== 'invalid')
    .map((l) => ({ ...l, state: l.key === 'positive' ? 'on' : 'off' }));
  assert.equal(
    conclude(incomplete).code,
    'unknown',
    'missing result lamps must still require review',
  );
});
test('Excel treats unlit, unknown and absent Power as display data without warnings or review', async () => {
  const variants = ['on', 'off', 'unknown', 'absent'].map((state) => {
    const device = setManualLampState(emptyDevice(), 'positive', 'on');
    device.body = { x: 0, y: 0, width: 100, height: 250 };
    device.lamps = device.lamps
      .filter((l) => state !== 'absent' || l.key !== 'power')
      .map((l) => (l.key === 'power' ? { ...l, state } : l));
    return {
      ...records[1],
      device,
      reviewed: true,
      barcode: '01202609030005',
      error: '',
    };
  });
  const workbook = await createWorkbook(variants);
  const sheet = workbook.getWorksheet('检测汇总');
  assert.equal(sheet.getCell('J1').value, 'Power（电源，仅展示）');
  for (let row = 2; row <= 5; row++) {
    assert.equal(sheet.getCell(`F${row}`).value, '阳性指示（+ Positive）');
    assert.equal(sheet.getCell(`K${row}`).value, '已校对');
    assert.equal(sheet.getCell(`N${row}`).value, '');
  }
  assert.equal(sheet.getCell('J4').value, '未识别');
  assert.equal(sheet.getCell('J5').value, '未识别');
});
test('full-frame analysis suppresses a strengthened reflection after lamp measurement', async () => {
  const frame = await pixels('test-img/a-2.jpg');
  const before = analyzeDevice(frame);
  const box = before.lamps[0].box;
  const cx = Math.round(box.x + box.width / 2),
    cy = Math.round(box.y + box.height / 2);
  for (let y = cy - 3; y <= cy + 3; y++)
    for (let x = cx - 2; x <= cx + 2; x++)
      frame.data.set([180, 40, 40, 255], (y * frame.width + x) * 4);
  assert.equal(measureLamp(frame, 'negative', box).state, 'on');
  for (const vision of [
    analyzeDevice(frame, before.body),
    orientDevice(frame).vision,
  ]) {
    assert.deepEqual(
      vision.lamps.map((l) => l.state),
      ['off', 'on', 'off', 'off'],
    );
    assert.equal(conclude(vision).code, 'positive');
  }
});
test('real sample Excel round trip preserves barcode, all lamp columns, uncertainty and photos', async () => {
  assert.equal(records.length, 2);
  records.sort((a, b) => a.id.localeCompare(b.id));
  const workbook = await createWorkbook(records);
  const data = await workbook.xlsx.writeBuffer();
  fs.writeFileSync('test-output/device/results.xlsx', data);
  const ExcelJS = require('exceljs');
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(data);
  const sheet = loaded.getWorksheet('检测汇总');
  assert.equal(sheet.getCell('D2').value, '01202609030006');
  assert.equal(sheet.getCell('D3').value, '01202609030005');
  assert.equal(sheet.getCell('D2').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('F2').value, '无效指示（Invalid）');
  assert.equal(sheet.getCell('F3').value, '阳性指示（+ Positive）');
  assert.match(sheet.getCell('I2').value, /亮起/);
  assert.equal(sheet.getCell('J3').value, '未见亮起');
  assert.equal(sheet.getCell('N3').value, '');
  assert.equal(sheet.getImages().length, 2);
  assert.equal(loaded.getWorksheet('灯态分析明细').rowCount, 9);
});

test('mobile first scan at 1536px still decodes both original sample barcodes', async () => {
  for (const [name, want] of Object.entries(expected)) {
    const frame = await pixels(`test-img/${name}.jpg`, 1536);
    const result = await decodeBarcode(frame);
    assert.equal(result.barcode, want.barcode);
    assert.equal(result.ambiguous, false);
  }
});
