const test = require('node:test');
const assert = require('node:assert/strict');
const { SaxesParser } = require('saxes');
const {
  emptyDevice,
  setManualLampState,
} = require('../.test-build/inspection.js');
const {
  createStandardExport,
  summarizeInspections,
  LOCAL_CODE_SYSTEM,
} = require('../.test-build/standard-export.js');

const date = new Date('2026-10-10T04:05:06.123Z');
function record(result = 'positive', overrides = {}) {
  const device = emptyDevice();
  device.body = { x: 0, y: 0, width: 100, height: 200 };
  device.lamps.forEach((l) => (l.state = 'off'));
  if (result !== 'unknown')
    device.lamps.find((l) => l.key === result).state = 'on';
  return {
    id: 'r-1',
    name: 'sample.jpg',
    image: '',
    displayImage: '',
    thumbnail: '',
    thumbnailWidth: 0,
    thumbnailHeight: 0,
    barcode: '001234567890123456789',
    format: 'Code128',
    barcodeBox: null,
    barcodeSource: 'decoded',
    device,
    imageWidth: 100,
    imageHeight: 200,
    rotation: 0,
    elapsedMs: 10,
    phase: 'done',
    error: '',
    reviewed: true,
    createdAt: '2026/10/10 12:00:00',
    createdTimestamp: date.getTime(),
    ...overrides,
  };
}
function output(records, format = 'fhir-json') {
  return createStandardExport(records, format, { exportedAt: date });
}
function bundle(records) {
  return JSON.parse(output(records).content);
}
function resources(b, type) {
  return b.entry
    .map((entry) => entry.resource)
    .filter((r) => r.resourceType === type);
}
function observations(b) {
  return resources(b, 'Observation').filter(
    (r) => r.code.coding[0].code === 'device-indicator-assessment',
  );
}
function components(observation) {
  return Object.fromEntries(
    observation.component.map((c) => [c.code.coding[0].code, c]),
  );
}
function csvRows(text) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && ch === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && ch === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += ch;
  }
  const headers = rows.shift();
  return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

test('empty and pending-only exports report unavailable rates rather than zero or NaN', () => {
  assert.deepEqual(summarizeInspections([]), {
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: 0,
    invalid: 0,
    needsReview: 0,
    positive: 0,
    negative: 0,
    processingErrorRate: null,
    averageElapsedMs: null,
  });
  const summary = summarizeInspections([
    record('invalid', { phase: 'queued' }),
    record('positive', { phase: 'reading' }),
  ]);
  assert.equal(summary.processingErrorRate, null);
  assert.equal(summary.invalid, 0);
  assert.equal(summary.needsReview, 0);
  assert.equal(summary.inProgress, 2);
  const b = bundle([]);
  assert.equal(b.type, 'collection');
  assert.equal(b.total, undefined);
  const metrics = components(resources(b, 'Observation')[0]);
  assert.ok(metrics['processing-error-rate'].dataAbsentReason);
  assert.ok(metrics['average-processing-duration'].dataAbsentReason);
});

test('rates use only finished records; explicit Invalid and review counts have documented overlap', () => {
  const conflict = record('positive');
  conflict.device.lamps.find((l) => l.key === 'invalid').state = 'on';
  const list = [
    record(),
    record('negative'),
    record('invalid', { reviewed: false }),
    conflict,
    record('positive', { reviewed: false }),
    record('invalid', { phase: 'error', elapsedMs: 20 }),
    record('positive', { phase: 'reading' }),
    record('positive', { phase: 'queued' }),
  ];
  assert.deepEqual(summarizeInspections(list), {
    total: 8,
    completed: 5,
    failed: 1,
    inProgress: 2,
    invalid: 1,
    needsReview: 3,
    positive: 1,
    negative: 1,
    processingErrorRate: 1 / 6,
    averageElapsedMs: 11.667,
  });
  const rows = csvRows(output(list, 'csv').content);
  assert.equal(
    rows.find((r) => r.metric === 'processing-error-rate').value,
    '16.666667',
  );
  assert.equal(rows.find((r) => r.metric === 'invalid-indications').value, '1');
  assert.equal(
    rows.filter((r) => r.row_type === 'inspection').length,
    list.length,
  );
});

test('unreviewed, missing-barcode, uncertain, conflicting, failed and pending records have no definite main value', () => {
  const conflict = record('positive');
  conflict.device.lamps.find((l) => l.key === 'negative').state = 'on';
  const list = [
    record('positive', { reviewed: false }),
    record('negative', { barcode: '' }),
    record('unknown'),
    conflict,
    record('positive', { phase: 'error', error: '解码失败' }),
    record('negative', { phase: 'reading' }),
    record('positive', { phase: 'queued' }),
  ];
  const obs = observations(bundle(list));
  for (const o of obs) {
    assert.equal(o.valueCodeableConcept, undefined);
    assert.ok(o.dataAbsentReason);
    assert.notEqual(o.status, 'final');
    assert.equal(o.interpretation, undefined);
  }
  assert.equal(obs[4].status, 'cancelled');
  assert.equal(obs[6].status, 'registered');
  assert.equal(
    components(obs[4])['raw-result'],
    undefined,
    'stale device result cannot survive a failed retry',
  );
  assert.equal(
    components(obs[5])['raw-result'],
    undefined,
    'pending work cannot expose stale result',
  );
  const csv = csvRows(output(list, 'csv').content).filter(
    (r) => r.row_type === 'inspection',
  );
  assert.deepEqual(
    csv.map((r) => r.export_result),
    [
      'review-required',
      'review-required',
      'review-required',
      'review-required',
      'processing-error',
      'processing',
      'processing',
    ],
  );
  assert.equal(
    csv[0].raw_result,
    'positive',
    'raw device indication remains auditable without becoming exported main result',
  );
  assert.equal(csv[4].raw_result, '');
});

test('Power on, off, unknown and absent affect display only in all standard formats and summary', () => {
  for (const result of ['positive', 'negative', 'invalid', 'unknown']) {
    const variants = ['on', 'off', 'unknown', 'missing'].map((state) => {
      const r = record(result);
      r.device.lamps = r.device.lamps
        .filter((l) => state !== 'missing' || l.key !== 'power')
        .map((l) => (l.key === 'power' ? { ...l, state } : l));
      return r;
    });
    for (const r of variants)
      assert.deepEqual(
        summarizeInspections([r]),
        summarizeInspections([variants[0]]),
      );
    const obs = observations(bundle(variants));
    for (const o of obs) {
      assert.deepEqual(o.valueCodeableConcept, obs[0].valueCodeableConcept);
      assert.deepEqual(o.dataAbsentReason, obs[0].dataAbsentReason);
      assert.deepEqual(o.note, obs[0].note);
      assert.deepEqual(
        components(o)['needs-review'],
        components(obs[0])['needs-review'],
      );
    }
    const csv = csvRows(output(variants, 'csv').content).filter(
      (r) => r.row_type === 'inspection',
    );
    assert.equal(new Set(csv.map((r) => r.export_result)).size, 1);
    assert.deepEqual(
      csv.map((r) => r.power_lamp_display_only),
      ['on', 'off', 'unknown', 'missing'],
    );
  }
});

test('FHIR identifiers preserve barcodes and manual provenance without inventing clinical codes or patient data', () => {
  const r = record('negative', { barcodeSource: 'manual' });
  r.device = setManualLampState(r.device, 'negative', 'on');
  const b = bundle([r]);
  const o = observations(b)[0];
  const specimen = resources(b, 'Specimen')[0];
  assert.equal(specimen.identifier[0].value, r.barcode);
  assert.equal(o.identifier[0].value, r.id);
  assert.equal(o.subject, undefined);
  assert.equal(
    o.effectiveDateTime,
    undefined,
    'record creation is not represented as clinical sampling/testing time',
  );
  assert.equal(specimen.subject, undefined);
  assert.equal(o.valueCodeableConcept.coding[0].system, LOCAL_CODE_SYSTEM);
  assert.equal(o.valueCodeableConcept.coding[0].code, 'negative');
  assert.equal(
    components(o)['barcode-source'].valueCodeableConcept.coding[0].code,
    'manual',
  );
  assert.equal(components(o)['negative-lamp-manual'].valueBoolean, true);
  assert.equal(
    components(o)['record-created-at'].valueDateTime,
    date.toISOString(),
  );
  assert.doesNotMatch(JSON.stringify(b), /loinc\.org|snomed\.info/);
  const urls = new Set(b.entry.map((e) => e.fullUrl));
  assert.equal(urls.size, b.entry.length);
  for (const url of urls)
    assert.match(
      url,
      /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  assert.ok(urls.has(o.specimen.reference));
  assert.ok(urls.has(o.device.reference));
});

test('legacy time strings remain verbatim, no guessed timezone; invalid duration does not poison metrics', () => {
  for (const createdAt of ['2026/10/10 12:34:56', 'not-a-date', '']) {
    const r = record('positive', {
      createdTimestamp: undefined,
      createdAt,
      elapsedMs: Number.NaN,
    });
    const c = components(observations(bundle([r]))[0]);
    assert.equal(c['record-created-at'], undefined);
    assert.equal(
      c['record-created-at-original']?.valueString,
      createdAt || undefined,
    );
    assert.equal(summarizeInspections([r]).averageElapsedMs, null);
  }
  const iso = record('positive', {
    createdTimestamp: undefined,
    createdAt: '2026-10-10T12:00:00+08:00',
  });
  assert.equal(
    components(observations(bundle([iso]))[0])['record-created-at']
      .valueDateTime,
    '2026-10-10T04:00:00.000Z',
  );
  assert.throws(
    () => createStandardExport([], 'csv', { exportedAt: new Date('invalid') }),
    /导出时间无效/,
  );
});

test('CSV uses UTF-8 BOM, rectangular rows and escaping; identifiers and formula-like fields are safe text', () => {
  const r = record('positive', {
    id: '=SUM(A1)',
    name: ' \t=HYPERLINK("https://example.invalid")',
    barcode: '0012345',
    error: '@SUM(1,2)\r\n第二行,"quoted"',
  });
  r.device.warnings = ['+cmd', '多行\n说明'];
  const file = output([r], 'csv');
  assert.equal(file.content.charCodeAt(0), 0xfeff);
  const rows = csvRows(file.content);
  const row = rows.find((r) => r.row_type === 'inspection');
  assert.equal(row.record_id_text, "'=SUM(A1)");
  assert.equal(row.barcode_text, "'0012345");
  assert.equal(row.file_name, `'${r.name}`);
  assert.equal(row.error, `'${r.error}`);
  assert.equal(row.warnings, "'+cmd\n多行\n说明");
  assert.equal(new Set(rows.map((r) => Object.keys(r).length)).size, 1);
  assert.equal(row.created_at_utc, date.toISOString());
  assert.match(file.fileName, /20261010T040506-123Z_[0-9a-f]{8}\.csv$/);
  assert.notEqual(file.fileName, output([r], 'csv').fileName);
});

// Compare canonical XML leaves with JSON leaves. This independently parses
// XML, including escaped control whitespace; it does not reuse the serializer.
function jsonLeaves(object, path = 'Bundle', out = []) {
  for (const [key, value] of Object.entries(object)) {
    if (key === 'resourceType') continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      const next = `${path}/${key}`;
      if (typeof item === 'object')
        jsonLeaves(
          item,
          item.resourceType ? `${next}/${item.resourceType}` : next,
          out,
        );
      else out.push([next, String(item)]);
    }
  }
  return out;
}
function xmlLeaves(text) {
  const parser = new SaxesParser({ xmlns: true });
  const path = [],
    out = [];
  parser.on('opentag', (tag) => {
    path.push(tag.local);
    assert.equal(tag.uri, 'http://hl7.org/fhir');
    if (tag.attributes.value)
      out.push([path.join('/'), tag.attributes.value.value]);
  });
  parser.on('closetag', () => path.pop());
  parser.write(text).close();
  return out;
}
function normalizeIds(leaves) {
  const ids = new Map();
  for (const [path, value] of leaves)
    if (path.endsWith('/fullUrl'))
      ids.set(value.replace('urn:uuid:', ''), `id-${ids.size}`);
  return leaves.map(([path, value]) => [
    path,
    value.replace(
      /(?:urn:uuid:)?([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/g,
      (match, id) =>
        `${match.startsWith('urn:') ? 'urn:uuid:' : ''}${ids.get(id) || id}`,
    ),
  ]);
}
test('FHIR JSON and independently parsed XML carry exactly the same leaf values and references', () => {
  const r = record('positive', {
    name: 'A<&"\'\r\n\tB.jpg',
    error: 'x < 3 & y > 2',
    barcode: '000<&"\'123',
  });
  r.device.warnings = ['光线\n警告 & <tag>'];
  const list = [
    r,
    record('invalid', { reviewed: false }),
    record('unknown', { phase: 'error' }),
  ];
  const json = output(list, 'fhir-json');
  const xml = output(list, 'fhir-xml');
  assert.equal(json.mimeType, 'application/fhir+json');
  assert.equal(xml.mimeType, 'application/fhir+xml');
  assert.deepEqual(
    normalizeIds(xmlLeaves(xml.content)),
    normalizeIds(jsonLeaves(JSON.parse(json.content))),
  );
  assert.match(xml.content, /&amp;/);
  assert.match(xml.content, /&#10;/);
  assert.doesNotMatch(xml.content, /<total /);
});

test('XML rejects unrepresentable control characters instead of producing a corrupt file', () => {
  const r = record('positive', { barcode: '001\u001d23' });
  assert.throws(() => output([r], 'fhir-xml'), /XML不支持的字符/);
  assert.equal(
    resources(bundle([r]), 'Specimen')[0].identifier[0].value,
    r.barcode,
  );
});

const enteredPatient = { name: '测试患者', gender: 'female', age: '35', patientId: '0000088', contact: '+86 00123456', testItem: 'Flu A' };
test('patient and selected project survive FHIR, CSV and Excel without inferred birth date or clinical terminology', async () => {
  const r = record('positive', { patient: enteredPatient, lockedAt: date.toISOString(), confirmedAt: date.toISOString() });
  const b = bundle([r]);
  const patient = resources(b, 'Patient')[0];
  const o = observations(b)[0];
  const specimen = resources(b, 'Specimen')[0];
  assert.equal(patient.identifier[0].value, enteredPatient.patientId);
  assert.deepEqual(patient.name, [{ text: enteredPatient.name }]);
  assert.equal(patient.gender, 'female');
  assert.equal(patient.telecom[0].value, enteredPatient.contact);
  assert.equal(patient.birthDate, undefined);
  assert.equal(specimen.subject.reference, o.subject.reference);
  assert.ok(b.entry.some((entry) => entry.fullUrl === o.subject.reference && entry.resource === patient));
  assert.equal(components(o)['test-item'].valueString, 'Flu A');
  assert.equal(components(o)['patient-age-at-entry'].valueQuantity.value, 35);
  assert.equal(components(o)['patient-age-at-entry'].valueQuantity.code, 'a');
  assert.equal(components(o)['confirmed-at'].valueDateTime, date.toISOString());
  assert.doesNotMatch(JSON.stringify(b), /loinc\.org|snomed\.info/);
  assert.deepEqual(normalizeIds(xmlLeaves(output([r], 'fhir-xml').content)), normalizeIds(jsonLeaves(b)));
  const csv = csvRows(output([r], 'csv').content).find((row) => row.row_type === 'inspection');
  assert.equal(csv.patient_name, enteredPatient.name);
  assert.equal(csv.patient_id_text, `'${enteredPatient.patientId}`);
  assert.equal(csv.patient_contact_text, `'${enteredPatient.contact}`);
  assert.equal(csv.test_item, enteredPatient.testItem);
  const { createWorkbook } = require('../.test-build/export.js');
  const workbook = await createWorkbook([r]);
  const sheet = workbook.getWorksheet('检测汇总');
  assert.equal(sheet.getCell('O2').value, enteredPatient.name);
  assert.equal(sheet.getCell('R2').value, enteredPatient.patientId);
  assert.equal(sheet.getCell('S2').value, enteredPatient.contact);
  assert.equal(sheet.getCell('T2').value, enteredPatient.testItem);
  assert.equal(sheet.getCell('R2').numFmt, '@');
});

function hl7Messages(content) {
  const segments = content.split('\r').filter(Boolean).map((line) => line.split('|'));
  const messages = [];
  for (const segment of segments) {
    if (segment[0] === 'MSH') messages.push([]);
    if (messages.length && !['BTS', 'FTS'].includes(segment[0])) messages.at(-1).push(segment);
  }
  return { segments, messages };
}
function hl7Observations(message) {
  return Object.fromEntries(message.filter((segment) => segment[0] === 'OBX').map((segment) => [segment[3].split('^')[0], segment]));
}
test('HL7 batch has independent ORU R01 2.5.1 messages, correct field positions, patient, project, specimen and timestamps', () => {
  const r = record('negative', { patient: enteredPatient, lockedAt: date.toISOString(), confirmedAt: date.toISOString() });
  const file = output([r, record('positive')], 'hl7-v2');
  assert.equal(file.mimeType, 'application/hl7-v2');
  assert.match(file.fileName, /^GenDX_T_.*\.hl7$/);
  const { segments, messages } = hl7Messages(file.content);
  assert.equal(segments[0][0], 'FHS');
  assert.equal(segments[1][0], 'BHS');
  assert.deepEqual(segments.at(-2), ['BTS', '2']);
  assert.deepEqual(segments.at(-1), ['FTS', '1']);
  assert.equal(messages.length, 2);
  const msh = messages[0][0];
  assert.equal(msh[8], 'ORU^R01^ORU_R01');
  assert.equal(msh[11], '2.5.1');
  assert.equal(msh[17], 'UNICODE UTF-8');
  assert.notEqual(msh[9], messages[1][0][9]);
  assert.ok(msh[9].length <= 20);
  const pid = messages[0].find((segment) => segment[0] === 'PID');
  assert.equal(pid[3], '0000088^^^GenDX_T');
  assert.equal(pid[5], enteredPatient.name);
  assert.equal(pid[7], '', 'age must not become an invented birth date');
  assert.equal(pid[8], 'F');
  const obr = messages[0].find((segment) => segment[0] === 'OBR');
  assert.equal(obr[4], 'Flu A^Flu A^L');
  assert.equal(obr[7], '', 'record creation must not become clinical observation time');
  assert.equal(obr[22], '20261010040506.123+0000');
  const obs = hl7Observations(messages[0]);
  assert.equal(obs['device-indicator-assessment'][5], 'negative^阴性指示^L');
  assert.equal(obs['device-indicator-assessment'][11], 'F');
  assert.equal(obs['specimen-barcode'][5], r.barcode);
  assert.equal(obs['patient-age-at-entry'][2], 'NM');
  assert.equal(obs['patient-age-at-entry'][5], '35');
  assert.equal(obs['record-created-at'][5], '20261010040506.123+0000');
  assert.ok(!messages[1].some((segment) => segment[0] === 'PID'), 'legacy record does not inherit the other patient');
});

test('HL7 protects separators and segment boundaries; uncertain/failed records never export a definite main indication', () => {
  const special = '|^~\\&\r\n';
  const r = record('positive', { patient: { ...enteredPatient, name: special, contact: special }, barcode: special, reviewed: false });
  const file = output([r, record('positive', { phase: 'error' }), record('positive', { phase: 'queued' })], 'hl7-v2');
  const { messages } = hl7Messages(file.content);
  assert.equal(messages.length, 3);
  const escaped = '\\F\\\\S\\\\R\\\\E\\\\T\\\\X0D\\\\X0A\\';
  assert.equal(messages[0].find((segment) => segment[0] === 'PID')[5], escaped);
  assert.equal(hl7Observations(messages[0])['patient-contact'][5], escaped);
  assert.equal(hl7Observations(messages[0])['specimen-barcode'][5], escaped);
  for (const message of messages) {
    const value = hl7Observations(message)['device-indicator-assessment'];
    assert.equal(value[5], '');
    assert.notEqual(value[11], 'F');
  }
  assert.equal(hl7Observations(messages[1])['device-indicator-assessment'][11], 'X');
  assert.equal(hl7Observations(messages[1])['raw-result'], undefined);
  assert.equal(file.content.includes('\n'), false);
});

test('HL7 Power state only changes its display OBX, never the indication/status', () => {
  const list = ['on', 'off', 'unknown', 'missing'].map((state) => {
    const r = record('negative');
    r.device.lamps = r.device.lamps.filter((lamp) => state !== 'missing' || lamp.key !== 'power')
      .map((lamp) => lamp.key === 'power' ? { ...lamp, state } : lamp);
    return r;
  });
  const { messages } = hl7Messages(output(list, 'hl7-v2').content);
  const observations = messages.map(hl7Observations);
  assert.equal(new Set(observations.map((obs) => obs['device-indicator-assessment'].join('|'))).size, 1);
  assert.equal(new Set(observations.map((obs) => obs['export-result'].join('|'))).size, 1);
  assert.deepEqual(observations.map((obs) => obs['power-lamp'][5].split('^')[0]), ['on', 'off', 'lamp-unknown', 'missing']);
});
