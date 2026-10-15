const test = require('node:test');
const assert = require('node:assert/strict');
const { exportInspectionFile } = require('../.test-build/file-export.js');

test('all file formats pass valid MIME types and bytes to the browser save picker', async () => {
  const expectations = {
    csv: ['text/csv', '.csv'],
    'fhir-json': ['application/fhir+json', '.json'],
    'fhir-xml': ['application/fhir+xml', '.xml'],
    'hl7-v2': ['application/hl7-v2', '.hl7'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  };
  for (const [format, [mime, extension]] of Object.entries(expectations)) {
    let saved;
    let closed = false;
    global.window = { showSaveFilePicker: async (options) => {
      assert.ok(options.suggestedName.endsWith(extension));
      assert.deepEqual(options.types[0].accept, { [mime]: [extension] });
      return { createWritable: async () => ({
        write: async (blob) => { saved = blob; },
        close: async () => { closed = true; },
        abort: async () => { assert.fail('successful save must not abort'); },
      }) };
    } };
    assert.equal(await exportInspectionFile([], format, 'save'), '检测数据已保存到所选位置');
    assert.equal(saved.type, mime);
    assert.ok(saved.size > 0);
    assert.equal(closed, true);
    if (format === 'fhir-json') assert.equal(JSON.parse(await saved.text()).resourceType, 'Bundle');
    if (format === 'fhir-xml') assert.match(await saved.text(), /<Bundle xmlns="http:\/\/hl7.org\/fhir">/);
    if (format === 'csv') assert.deepEqual(Array.from(new Uint8Array(await saved.arrayBuffer()).slice(0, 3)), [239, 187, 191]);
  }
  delete global.window;
});

test('cancelled picker does not claim success; a failed write aborts and propagates the failure', async () => {
  global.window = { showSaveFilePicker: async () => { throw new DOMException('cancelled', 'AbortError'); } };
  assert.equal(await exportInspectionFile([], 'fhir-xml', 'save'), '已取消保存');
  let aborted = false;
  global.window = { showSaveFilePicker: async () => ({ createWritable: async () => ({
    write: async () => { throw new Error('disk full'); },
    close: async () => { assert.fail('failed write must not close successfully'); },
    abort: async () => { aborted = true; },
  }) }) };
  await assert.rejects(exportInspectionFile([], 'csv', 'save'), /disk full/);
  assert.equal(aborted, true);
  delete global.window;
});
