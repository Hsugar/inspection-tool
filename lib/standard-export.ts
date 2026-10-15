import { conclude, needsReview, type Inspection } from './inspection';
import { lampDefinitions } from './device-vision';

export type StandardExportFormat = 'csv' | 'hl7-v2' | 'fhir-json' | 'fhir-xml';
export type InspectionSummary = {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  invalid: number;
  needsReview: number;
  positive: number;
  negative: number;
  processingErrorRate: number | null;
  averageElapsedMs: number | null;
};
export type StandardExport = {
  fileName: string;
  mimeType: string;
  content: string;
  summary: InspectionSummary;
};
type ExportResult =
  | 'positive'
  | 'negative'
  | 'invalid'
  | 'review-required'
  | 'processing'
  | 'processing-error';
type FhirValue = string | number | boolean | FhirObject | FhirValue[];
type FhirObject = { [key: string]: FhirValue | undefined };

// This is an application-local vocabulary, not a clinical terminology or a
// claimed national/recipient implementation guide. Its definitions travel in
// the Bundle as a CodeSystem resource.
export const LOCAL_CODE_SYSTEM = 'urn:inspection-tool:codes:v1';
const ABSENT_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/data-absent-reason';
const SCOPE =
  '仅统计当前导出的本地保留记录；一条记录代表一次照片处理，不代表设备累计检测次数。错误率=处理失败数/(处理完成数+处理失败数)，不是临床误判率。';
const INDICATION_NOTE =
  '本数据描述照片中的设备灯态指示，不是患者诊断或检测有效性认证。Negative、Positive、Invalid互斥；Power仅展示，不影响结果或待确认。待确认记录不输出确定阴阳主值。';
const CSV_TEXT_NOTE =
  'CSV为表格交换格式，不是FHIR资源。条码/记录ID及可能被表格软件执行或改写的文本前置一个英文撇号作文本保护；程序导入这些字段时移除该保护前缀。FHIR保留原始字符串。';
const definitions: Record<string, [string, string]> = {
  'patient-age-at-entry': [
    '录入年龄',
    '拍摄前用户录入的整数年龄（岁），不推算出生日期。',
  ],
  'patient-contact': ['联系方式', '用户录入的联系方式原文。'],
  'test-item': ['检测项目', '拍摄前用户选择的项目名称；不推断临床编码。'],
  'specimen-barcode': [
    '样本条码',
    '照片自动解码的试管标识；旧记录可能包含人工录入条码。',
  ],
  'confirmed-at': [
    '确认保存时间',
    '用户确认并锁定照片记录的时间，不代表样本采集时间。',
  ],
  'locked-at': ['锁定时间', '检测信息成为只读记录的时间。'],
  'software-application': [
    '照片识别应用',
    '照片导入、灯态分析与导出软件；不表示实体检测仪或其序列号。',
  ],
  'device-indicator-assessment': [
    '设备灯态指示记录',
    '对设备照片的灯态分析及人工校对记录；不表示患者临床诊断。',
  ],
  'retained-record-statistics': ['保留记录使用统计', SCOPE],
  positive: ['阳性指示', '已完成校对且结果灯明确为Positive；仅表示设备指示。'],
  negative: ['阴性指示', '已完成校对且结果灯明确为Negative；仅表示设备指示。'],
  invalid: ['无效指示', '结果灯明确为Invalid，不表示有效阴性或阳性。'],
  conflict: ['结果灯冲突', '多个结果灯同时亮起，不能确定结果。'],
  unknown: ['结果未知', '结果灯尚未可靠区分或未亮，不能确定结果。'],
  'review-required': [
    '待确认',
    '人工校对未完成、条码缺失，或结果灯不确定/冲突。',
  ],
  processing: ['处理中', '当前照片处理尚未结束，不输出结果。'],
  'processing-error': ['处理失败', '照片处理失败，不输出结果。'],
  queued: ['排队中', '等待处理。'],
  reading: ['识别中', '正在处理。'],
  done: ['处理完成', '照片处理完成，不等同于已人工校对。'],
  error: ['处理错误', '照片处理发生错误。'],
  on: ['亮起', '观察到指示灯亮起。'],
  off: ['未见亮起', '未观察到指示灯亮起。'],
  missing: ['缺失', '该灯态未保存在记录中。'],
  'lamp-unknown': ['未识别', '该灯位状态尚未识别；Power的此状态不影响结果。'],
  decoded: ['自动解码', '条码来自图像解码。'],
  manual: ['人工录入', '条码来自人工输入。'],
  unread: ['未识别', '尚未识别出条码。'],
  'raw-result': [
    '原始灯态结论',
    '仅保存已完成处理的原始算法/灯态结论，不能替代已校对主值。',
  ],
  'export-result': ['导出状态', '已校对的设备指示或阻止输出主值的状态。'],
  'processing-phase': ['处理阶段', '导出时的照片处理阶段。'],
  reviewed: ['人工校对标记', '记录是否已被用户标记为校对完成。'],
  'needs-review': [
    '仍需确认',
    '处理完成记录是否仍需要校对；失败/处理中单独标记。',
  ],
  'barcode-source': ['条码来源', '记录中试管条码的来源。'],
  'barcode-format': ['条码格式', '记录中保存的条码制式。'],
  'file-name': ['原始文件名', '导入照片的文件名。'],
  'record-created-at': [
    '记录创建时间',
    '本地记录建立时间，不代表样本采集时间或检测发生时间。',
  ],
  'record-created-at-original': [
    '原始时间文本',
    '保留本地原始显示时间；无时区的旧时间不推断为精确时刻。',
  ],
  'processing-duration': ['处理耗时', '已完成或失败记录保存的照片处理耗时。'],
  'processing-error-detail': ['处理错误说明', '本地记录保存的处理错误提示。'],
  'negative-lamp': ['Negative灯', 'Negative结果灯状态。'],
  'positive-lamp': ['Positive灯', 'Positive结果灯状态。'],
  'invalid-lamp': ['Invalid灯', 'Invalid结果灯状态。'],
  'power-lamp': [
    'Power灯（仅展示）',
    '电源灯状态，不参与结果、待确认或统计判定。',
  ],
  'negative-lamp-manual': ['Negative人工校对', '该灯态是否经人工修改。'],
  'positive-lamp-manual': ['Positive人工校对', '该灯态是否经人工修改。'],
  'invalid-lamp-manual': ['Invalid人工校对', '该灯态是否经人工修改。'],
  'power-lamp-manual': ['Power人工校对', '电源状态是否经人工修改，仅展示。'],
  'total-records': ['保留记录数', '本次导出记录数，包括处理中与失败。'],
  'completed-records': ['处理完成数', 'phase=done的记录数。'],
  'failed-records': ['处理失败数', 'phase=error的记录数。'],
  'in-progress-records': ['处理中数量', 'phase=queued或reading的记录数。'],
  'invalid-indications': [
    '明确无效指示次数',
    '已完成处理且原始互斥结论为Invalid的记录数；与待确认数可重叠。',
  ],
  'review-required-records': [
    '待确认数量',
    '已完成处理且仍需人工确认的记录数，不包含处理失败或处理中。',
  ],
  'confirmed-positive-indications': [
    '已校对阳性指示数',
    '已完成处理且无待确认原因的Positive指示数。',
  ],
  'confirmed-negative-indications': [
    '已校对阴性指示数',
    '已完成处理且无待确认原因的Negative指示数。',
  ],
  'processing-error-rate': [
    '处理失败率',
    '失败/(完成+失败)，以百分比导出；分母为0时未知，不是临床误判率。',
  ],
  'average-processing-duration': [
    '平均处理耗时',
    '有有效非负耗时的已完成与失败记录的平均值；无样本时未知。',
  ],
};

function coded(code: string): FhirObject {
  return {
    coding: [
      {
        system: LOCAL_CODE_SYSTEM,
        version: '1',
        code,
        display: definitions[code]?.[0] || code,
      },
    ],
    text: definitions[code]?.[0] || code,
  };
}
function absent(code: string, text: string): FhirObject {
  return { coding: [{ system: ABSENT_SYSTEM, code }], text };
}
function component(
  code: string,
  valueName: string,
  value: FhirValue,
): FhirObject {
  return { code: coded(code), [valueName]: value };
}
function quantity(value: number, unit: string): FhirObject {
  return { value, unit, system: 'http://unitsofmeasure.org', code: unit };
}
function normalized(record: Inspection) {
  const rawResult =
    record.phase === 'done' ? conclude(record.device).code : null;
  const reviewRequired = record.phase === 'done' && needsReview(record);
  const exportResult: ExportResult =
    record.phase === 'error'
      ? 'processing-error'
      : record.phase !== 'done'
        ? 'processing'
        : reviewRequired ||
            !rawResult ||
            rawResult === 'unknown' ||
            rawResult === 'conflict'
          ? 'review-required'
          : rawResult;
  const elapsedMs =
    (record.phase === 'done' || record.phase === 'error') &&
    Number.isFinite(record.elapsedMs) &&
    record.elapsedMs >= 0
      ? record.elapsedMs
      : null;
  // A locale-formatted legacy createdAt is not safely interpretable across
  // platforms. Keep it verbatim and do not fabricate a timezone/date.
  let createdTimestamp: string | null = null;
  if (
    typeof record.createdTimestamp === 'number' &&
    Number.isFinite(record.createdTimestamp)
  ) {
    const date = new Date(record.createdTimestamp);
    if (
      Number.isFinite(date.getTime()) &&
      date.getUTCFullYear() >= 1 &&
      date.getUTCFullYear() <= 9999
    )
      createdTimestamp = date.toISOString();
  } else if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      record.createdAt,
    )
  ) {
    const date = new Date(record.createdAt);
    if (Number.isFinite(date.getTime())) createdTimestamp = date.toISOString();
  }
  return {
    record,
    rawResult,
    exportResult,
    reviewRequired,
    elapsedMs,
    createdTimestamp,
  };
}
type Normalized = ReturnType<typeof normalized>;

/** Counts describe this retained-record snapshot, not lifetime hardware usage. */
export function summarizeInspections(records: Inspection[]): InspectionSummary {
  const rows = records.map(normalized);
  const completed = records.filter((r) => r.phase === 'done').length;
  const failed = records.filter((r) => r.phase === 'error').length;
  const durations = rows.flatMap((row) =>
    row.elapsedMs === null ? [] : [row.elapsedMs],
  );
  return {
    total: records.length,
    completed,
    failed,
    inProgress: records.length - completed - failed,
    invalid: rows.filter((r) => r.rawResult === 'invalid').length,
    needsReview: rows.filter((r) => r.reviewRequired).length,
    positive: rows.filter((r) => r.exportResult === 'positive').length,
    negative: rows.filter((r) => r.exportResult === 'negative').length,
    processingErrorRate:
      completed + failed ? failed / (completed + failed) : null,
    averageElapsedMs: durations.length
      ? Number(
          (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(3),
        )
      : null,
  };
}

function uuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues)
    globalThis.crypto.getRandomValues(bytes);
  else
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const summaryMetrics: [keyof InspectionSummary, string][] = [
  ['total', 'total-records'],
  ['completed', 'completed-records'],
  ['failed', 'failed-records'],
  ['inProgress', 'in-progress-records'],
  ['invalid', 'invalid-indications'],
  ['needsReview', 'review-required-records'],
  ['positive', 'confirmed-positive-indications'],
  ['negative', 'confirmed-negative-indications'],
  ['processingErrorRate', 'processing-error-rate'],
  ['averageElapsedMs', 'average-processing-duration'],
];

function buildBundle(
  rows: Normalized[],
  summary: InspectionSummary,
  timestamp: string,
): FhirObject {
  const entries: FhirObject[] = [];
  function add(resource: FhirObject) {
    const id = uuid();
    const fullUrl = `urn:uuid:${id}`;
    entries.push({
      fullUrl,
      resource: { resourceType: resource.resourceType, id, ...resource },
    });
    return { reference: fullUrl };
  }
  add({
    resourceType: 'CodeSystem',
    url: LOCAL_CODE_SYSTEM,
    version: '1',
    name: 'InspectionToolLocalCodes',
    title: 'GenDX_T 本地设备灯态与使用统计代码',
    status: 'active',
    experimental: false,
    description: `${INDICATION_NOTE} ${SCOPE} 本地词汇随包提供；接收方需做术语映射，不宣称符合特定地区HIE实施指南。`,
    caseSensitive: true,
    content: 'complete',
    concept: Object.entries(definitions).map(
      ([code, [display, definition]]) => ({ code, display, definition }),
    ),
  });
  const software = add({
    resourceType: 'Device',
    deviceName: [
      { name: 'GenDX_T 照片灯态识别软件', type: 'user-friendly-name' },
    ],
    type: coded('software-application'),
    note: [
      {
        text: '软件资源用于标识照片处理工具；患者与项目来自逐次录入。未采集实体检测仪序列号、样本类型或采集时间，不推断这些信息。',
      },
    ],
  });
  add({
    resourceType: 'Observation',
    status: 'final',
    code: coded('retained-record-statistics'),
    subject: software,
    effectiveDateTime: timestamp,
    issued: timestamp,
    note: [
      { text: SCOPE },
      {
        text: '无效指示次数与待确认数量可重叠；阴阳计数仅包含已校对且无待确认原因的设备指示。',
      },
    ],
    device: software,
    component: summaryMetrics.map(([key, code]) => {
      const value = summary[key];
      if (value === null)
        return {
          code: coded(code),
          dataAbsentReason: absent('unknown', '没有可用的统计分母或耗时样本。'),
        };
      if (key === 'processingErrorRate')
        return component(
          code,
          'valueQuantity',
          quantity(Number((value * 100).toFixed(6)), '%'),
        );
      if (key === 'averageElapsedMs')
        return component(
          code,
          'valueQuantity',
          quantity(Number(value.toFixed(3)), 'ms'),
        );
      return component(code, 'valueInteger', value);
    }),
  });
  for (const row of rows) {
    const {
      record,
      rawResult,
      exportResult,
      reviewRequired,
      elapsedMs,
      createdTimestamp,
    } = row;
    const patient = record.patient
      ? add({
          resourceType: 'Patient',
          identifier: [
            {
              system: 'urn:inspection-tool:identifier:patient',
              value: record.patient.patientId,
            },
          ],
          name: [{ text: record.patient.name }],
          telecom: [{ system: 'other', value: record.patient.contact }],
          gender: record.patient.gender,
        })
      : undefined;
    const specimen = record.barcode
      ? add({
          resourceType: 'Specimen',
          identifier: [
            {
              system: 'urn:inspection-tool:identifier:tube-barcode',
              value: record.barcode,
            },
          ],
          ...(patient ? { subject: patient } : {}),
          note: [
            {
              text: '由试管条码关联；未记录样本类型或采集时间。患者信息仅在拍摄前已录入时提供。',
            },
          ],
        })
      : undefined;
    const components = [
      component(
        'processing-phase',
        'valueCodeableConcept',
        coded(record.phase),
      ),
      component('export-result', 'valueCodeableConcept', coded(exportResult)),
      component('reviewed', 'valueBoolean', record.reviewed),
      component('needs-review', 'valueBoolean', reviewRequired),
      component(
        'barcode-source',
        'valueCodeableConcept',
        coded(record.barcodeSource),
      ),
    ];
    if (record.patient) {
      components.push(
        component('test-item', 'valueString', record.patient.testItem),
      );
      components.push(
        component(
          'patient-age-at-entry',
          'valueQuantity',
          quantity(Number(record.patient.age), 'a'),
        ),
      );
    }
    if (record.confirmedAt)
      components.push(
        component('confirmed-at', 'valueDateTime', record.confirmedAt),
      );
    if (record.lockedAt)
      components.push(component('locked-at', 'valueDateTime', record.lockedAt));
    if (rawResult)
      components.push(component('raw-result', 'valueString', rawResult));
    if (record.name)
      components.push(component('file-name', 'valueString', record.name));
    if (record.format)
      components.push(
        component('barcode-format', 'valueString', record.format),
      );
    if (record.createdAt)
      components.push(
        component(
          'record-created-at-original',
          'valueString',
          record.createdAt,
        ),
      );
    if (createdTimestamp)
      components.push(
        component('record-created-at', 'valueDateTime', createdTimestamp),
      );
    if (elapsedMs !== null)
      components.push(
        component(
          'processing-duration',
          'valueQuantity',
          quantity(elapsedMs, 'ms'),
        ),
      );
    if (record.error)
      components.push(
        component('processing-error-detail', 'valueString', record.error),
      );
    for (const { key } of lampDefinitions) {
      const lamp = record.device.lamps.find((l) => l.key === key);
      components.push(
        component(
          `${key}-lamp`,
          'valueCodeableConcept',
          coded(
            lamp?.state === 'unknown'
              ? 'lamp-unknown'
              : lamp?.state || 'missing',
          ),
        ),
      );
      if (lamp)
        components.push(
          component(`${key}-lamp-manual`, 'valueBoolean', Boolean(lamp.manual)),
        );
    }
    const definite =
      exportResult === 'positive' ||
      exportResult === 'negative' ||
      exportResult === 'invalid';
    add({
      resourceType: 'Observation',
      ...(record.id
        ? {
            identifier: [
              {
                system: 'urn:inspection-tool:identifier:record',
                value: record.id,
              },
            ],
          }
        : {}),
      status:
        exportResult === 'processing-error'
          ? 'cancelled'
          : definite
            ? 'final'
            : record.phase === 'queued'
              ? 'registered'
              : 'preliminary',
      code: coded('device-indicator-assessment'),
      ...(patient ? { subject: patient } : {}),
      issued: timestamp,
      ...(definite
        ? { valueCodeableConcept: coded(exportResult) }
        : {
            dataAbsentReason: absent(
              exportResult === 'processing-error' ? 'error' : 'temp-unknown',
              definitions[exportResult][1],
            ),
          }),
      note: [
        { text: INDICATION_NOTE },
        ...record.device.warnings.filter(Boolean).map((text) => ({ text })),
      ],
      ...(specimen ? { specimen } : {}),
      device: software,
      component: components,
    });
  }
  // A collection Bundle must not carry the search/history-only `total` field.
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp,
    entry: entries,
  };
}

// Objects are constructed above in FHIR R4 element order. Repeated properties
// become repeated elements; nested resources keep their resource-type wrapper.
function xmlEscape(value: string): string {
  if (
    Array.from(value).some((character) => {
      const code = character.codePointAt(0)!;
      return (
        (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
        (code >= 0xd800 && code <= 0xdfff) ||
        code === 0xfffe ||
        code === 0xffff
      );
    })
  )
    throw new Error(
      '记录含XML不支持的字符，请选择FHIR JSON导出或校正文本后重试。',
    );
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;')
    .replace(/\t/g, '&#9;');
}
function fhirXml(bundle: FhirObject): string {
  function element(name: string, value: FhirValue, indent: number): string {
    const padding = '  '.repeat(indent);
    if (Array.isArray(value))
      return value.map((v) => element(name, v, indent)).join('');
    if (typeof value !== 'object')
      return `${padding}<${name} value="${xmlEscape(String(value))}"/>\n`;
    if (typeof value.resourceType === 'string') {
      const resourceName = value.resourceType;
      const children = fields(value, indent + 2);
      return `${padding}<${name}>\n${padding}  <${resourceName}>\n${children}${padding}  </${resourceName}>\n${padding}</${name}>\n`;
    }
    return `${padding}<${name}>\n${fields(value, indent + 1)}${padding}</${name}>\n`;
  }
  function fields(object: FhirObject, indent: number): string {
    return Object.entries(object)
      .filter(([key, value]) => key !== 'resourceType' && value !== undefined)
      .map(([key, value]) => element(key, value!, indent))
      .join('');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Bundle xmlns="http://hl7.org/fhir">\n${fields(bundle, 1)}</Bundle>\n`;
}

function csv(
  rows: Normalized[],
  summary: InspectionSummary,
  timestamp: string,
): string {
  const headers = [
    'row_type',
    'metric',
    'value',
    'definition',
    'record_id_text',
    'file_name',
    'barcode_text',
    'barcode_source',
    'barcode_format',
    'phase',
    'raw_result',
    'export_result',
    'reviewed',
    'needs_review',
    'negative_lamp',
    'positive_lamp',
    'invalid_lamp',
    'power_lamp_display_only',
    'manual_lamps',
    'elapsed_ms',
    'created_at_utc',
    'created_at_original',
    'error',
    'warnings',
    'exported_at_utc',
    'patient_name',
    'patient_gender',
    'patient_age_years',
    'patient_id_text',
    'patient_contact_text',
    'test_item',
    'confirmed_at_utc',
    'locked_at_utc',
  ];
  type CsvValue = string | number | boolean | null | undefined;
  const table: CsvValue[][] = [];
  const add = (values: Record<string, CsvValue>) =>
    table.push(headers.map((key) => values[key] ?? ''));
  for (const [metric, value] of [
    ['scope', SCOPE],
    ['indication_note', INDICATION_NOTE],
    ['csv_text_encoding', CSV_TEXT_NOTE],
    ['local_code_system', LOCAL_CODE_SYSTEM],
  ])
    add({ row_type: 'metadata', metric, value, exported_at_utc: timestamp });
  for (const [key, code] of summaryMetrics) {
    const value = summary[key];
    add({
      row_type: 'summary',
      metric: code,
      value:
        key === 'processingErrorRate' && value !== null
          ? Number((value * 100).toFixed(6))
          : value,
      definition: definitions[code][1],
      exported_at_utc: timestamp,
    });
  }
  for (const row of rows) {
    const r = row.record;
    const lamp = (key: string) =>
      r.device.lamps.find((l) => l.key === key)?.state || 'missing';
    add({
      row_type: 'inspection',
      record_id_text: r.id ? `'${r.id}` : '',
      file_name: r.name,
      barcode_text: r.barcode ? `'${r.barcode}` : '',
      barcode_source: r.barcodeSource,
      barcode_format: r.format,
      phase: r.phase,
      raw_result: row.rawResult,
      export_result: row.exportResult,
      reviewed: r.reviewed,
      needs_review: row.reviewRequired,
      negative_lamp: lamp('negative'),
      positive_lamp: lamp('positive'),
      invalid_lamp: lamp('invalid'),
      power_lamp_display_only: lamp('power'),
      manual_lamps: r.device.lamps
        .filter((l) => l.manual)
        .map((l) => l.key)
        .join('|'),
      elapsed_ms: row.elapsedMs,
      created_at_utc: row.createdTimestamp,
      created_at_original: r.createdAt,
      error: r.error,
      warnings: r.device.warnings.join('\n'),
      exported_at_utc: timestamp,
      patient_name: r.patient?.name,
      patient_gender: r.patient?.gender,
      patient_age_years: r.patient?.age,
      patient_id_text: r.patient?.patientId ? `'${r.patient.patientId}` : '',
      patient_contact_text: r.patient?.contact ? `'${r.patient.contact}` : '',
      test_item: r.patient?.testItem,
      confirmed_at_utc: r.confirmedAt,
      locked_at_utc: r.lockedAt,
    });
  }
  function cell(value: CsvValue): string {
    let text = value == null ? '' : String(value);
    // Quoting alone does not prevent spreadsheet formula evaluation. Also
    // protect digit-only strings and leading controls/whitespace before tokens.
    const firstVisible = Array.from(text).find(
      (character) => character.charCodeAt(0) > 32 && character.trim() !== '',
    );
    if (
      typeof value === 'string' &&
      ((firstVisible !== undefined && '=+-@'.includes(firstVisible)) ||
        text.startsWith('\t') ||
        text.startsWith('\r') ||
        text.startsWith('\n') ||
        /^\d+$/.test(text))
    )
      text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
  return (
    '\uFEFF' +
    [headers, ...table].map((row) => row.map(cell).join(',')).join('\r\n') +
    '\r\n'
  );
}

/** HL7 v2.5.1 ER7 escaping: user text can never inject a new segment/field. */
function hl7Escape(value: string): string {
  if (value === '""') return '\\X2222\\';
  const separators: Record<string, string> = {
    '|': '\\F\\',
    '^': '\\S\\',
    '~': '\\R\\',
    '\\': '\\E\\',
    '&': '\\T\\',
  };
  return Array.from(value, (character) => {
    if (separators[character]) return separators[character];
    const code = character.charCodeAt(0);
    return code < 32 || code === 127
      ? `\\X${code.toString(16).toUpperCase().padStart(2, '0')}\\`
      : character;
  }).join('');
}
function hl7Timestamp(value: string): string {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '')
    .replace('Z', '+0000');
}
function hl7Segment(
  name: string,
  fields: Record<number, string | undefined>,
): string {
  const values = Array.from(
    { length: Math.max(0, ...Object.keys(fields).map(Number)) + 1 },
    () => '',
  );
  values[0] = name;
  for (const [position, value] of Object.entries(fields))
    values[Number(position)] = value || '';
  return values.join('|');
}
function hl7Batch(rows: Normalized[], timestamp: string): string {
  const exportedAt = hl7Timestamp(timestamp);
  const header = (name: 'FHS' | 'BHS') =>
    [name, '^~\\&', 'GenDX_T', '', '', '', exportedAt].join('|');
  const segments = [header('FHS'), header('BHS')];
  for (const row of rows) {
    const r = row.record;
    const definite = ['positive', 'negative', 'invalid'].includes(
      row.exportResult,
    );
    const status =
      row.exportResult === 'processing-error' ? 'X' : definite ? 'F' : 'P';
    const localCode = (code: string) =>
      `${hl7Escape(code)}^${hl7Escape(definitions[code]?.[0] || code)}^L`;
    // MSH-1 is the delimiter itself, so the array index is one less than its
    // HL7 field number from MSH-2 onwards. All other segment arrays use the
    // actual field number. No clinical collection/test timestamps are invented.
    segments.push(
      [
        'MSH',
        '^~\\&',
        'GenDX_T',
        '',
        '',
        '',
        exportedAt,
        '',
        'ORU^R01^ORU_R01',
        uuid().replace(/-/g, '').slice(0, 20),
        'P',
        '2.5.1',
        '',
        '',
        'NE',
        'NE',
        '',
        'UNICODE UTF-8',
      ].join('|'),
    );
    if (r.patient) {
      segments.push(
        hl7Segment('PID', {
          1: '1',
          3: `${hl7Escape(r.patient.patientId)}^^^GenDX_T`,
          5: hl7Escape(r.patient.name),
          8: { male: 'M', female: 'F', other: 'O' }[r.patient.gender],
        }),
      );
    }
    segments.push(
      hl7Segment('OBR', {
        1: '1',
        3: `${hl7Escape(r.id)}^GenDX_T`,
        4: localCode(r.patient?.testItem || 'device-indicator-assessment'),
        ...(r.confirmedAt ? { 22: hl7Timestamp(r.confirmedAt) } : {}),
        25: definite ? 'F' : 'P',
      }),
    );
    segments.push(
      hl7Segment('NTE', {
        1: '1',
        3: hl7Escape(
          `${INDICATION_NOTE} 本文件为离线交换批次，L 为应用本地编码，接收方需映射。年龄为录入年龄，不推算出生日期；联系方式保留原文。记录时间不代表检测或采样时间。`,
        ),
      }),
    );
    let nextObx = 0;
    const obx = (
      code: string,
      value: string,
      type = 'ST',
      unit = '',
      resultStatus = status,
    ) => {
      segments.push(
        hl7Segment('OBX', {
          1: String(++nextObx),
          2: type,
          3: localCode(code),
          5: value,
          ...(unit ? { 6: unit } : {}),
          11: resultStatus,
        }),
      );
    };
    obx(
      'device-indicator-assessment',
      definite ? localCode(row.exportResult) : '',
      'CE',
    );
    obx('export-result', localCode(row.exportResult), 'CE');
    obx('processing-phase', localCode(r.phase), 'CE');
    obx('reviewed', r.reviewed ? 'true' : 'false');
    if (r.patient) {
      obx(
        'patient-age-at-entry',
        String(Number(r.patient.age)),
        'NM',
        'a^year^UCUM',
      );
      obx('patient-contact', hl7Escape(r.patient.contact), 'TX');
      obx('test-item', hl7Escape(r.patient.testItem));
    }
    if (r.barcode) obx('specimen-barcode', hl7Escape(r.barcode));
    obx('barcode-source', localCode(r.barcodeSource), 'CE');
    if (row.rawResult) obx('raw-result', hl7Escape(row.rawResult));
    if (row.createdTimestamp)
      obx('record-created-at', hl7Timestamp(row.createdTimestamp), 'TS');
    if (r.createdAt) obx('record-created-at-original', hl7Escape(r.createdAt));
    if (r.confirmedAt) obx('confirmed-at', hl7Timestamp(r.confirmedAt), 'TS');
    if (r.lockedAt) obx('locked-at', hl7Timestamp(r.lockedAt), 'TS');
    if (row.elapsedMs !== null)
      obx(
        'processing-duration',
        String(row.elapsedMs),
        'NM',
        'ms^millisecond^UCUM',
      );
    for (const { key } of lampDefinitions) {
      const state =
        r.device.lamps.find((lamp) => lamp.key === key)?.state || 'missing';
      obx(
        `${key}-lamp`,
        localCode(state === 'unknown' ? 'lamp-unknown' : state),
        'CE',
      );
    }
    if (r.error) obx('processing-error-detail', hl7Escape(r.error), 'TX');
    const warnings = r.device.warnings.filter(Boolean);
    if (warnings.length)
      segments.push(
        hl7Segment('NTE', { 1: '1', 3: warnings.map(hl7Escape).join('~') }),
      );
  }
  segments.push(
    hl7Segment('BTS', { 1: String(rows.length) }),
    hl7Segment('FTS', { 1: '1' }),
  );
  return `${segments.join('\r')}\r`;
}

/** Produces an offline file; no network transmission or patient inference. */
export function createStandardExport(
  records: Inspection[],
  format: StandardExportFormat,
  options: { exportedAt?: Date } = {},
): StandardExport {
  const exportedAt = options.exportedAt || new Date();
  if (
    !Number.isFinite(exportedAt.getTime()) ||
    exportedAt.getUTCFullYear() < 1 ||
    exportedAt.getUTCFullYear() > 9999
  )
    throw new Error('导出时间无效。');
  const timestamp = exportedAt.toISOString();
  const summary = summarizeInspections(records);
  const rows = records.map(normalized);
  const stamp = timestamp.replace(/[-:]/g, '').replace('.', '-');
  const stem = `GenDX_T_${format}_${stamp}_${uuid().slice(0, 8)}`;
  if (format === 'hl7-v2')
    return {
      fileName: `${stem}.hl7`,
      mimeType: 'application/hl7-v2',
      content: hl7Batch(rows, timestamp),
      summary,
    };
  if (format === 'csv')
    return {
      fileName: `${stem}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      content: csv(rows, summary, timestamp),
      summary,
    };
  const bundle = buildBundle(rows, summary, timestamp);
  if (format === 'fhir-json')
    return {
      fileName: `${stem}.json`,
      mimeType: 'application/fhir+json',
      content: JSON.stringify(bundle, null, 2),
      summary,
    };
  if (format === 'fhir-xml')
    return {
      fileName: `${stem}.xml`,
      mimeType: 'application/fhir+xml',
      content: fhirXml(bundle),
      summary,
    };
  throw new Error('不支持的导出格式。');
}
