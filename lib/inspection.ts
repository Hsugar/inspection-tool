import {
  lampDefinitions,
  type Box,
  type DeviceVision,
  type LampKey,
  type LampState,
} from './device-vision';
import type { PatientInfo } from './patient';
export type { PatientInfo } from './patient';
export type Conclusion = {
  code: 'positive' | 'negative' | 'invalid' | 'conflict' | 'unknown';
  title: string;
  summary: string;
  tone: 'red' | 'green' | 'amber';
  warnings: string[];
};
export type Inspection = {
  id: string;
  name: string;
  image: string;
  displayImage: string;
  thumbnail: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  barcode: string;
  format: string;
  barcodeBox: Box | null;
  barcodeSource: 'decoded' | 'manual' | 'unread';
  device: DeviceVision;
  imageWidth: number;
  imageHeight: number;
  rotation: number;
  elapsedMs: number;
  phase: 'queued' | 'reading' | 'done' | 'error';
  error: string;
  reviewed: boolean;
  patient?: PatientInfo;
  lockedAt?: string;
  confirmedAt?: string;
  createdAt: string;
  createdTimestamp?: number;
  runtimeStats?: {
    scanSize: number;
    loadMs: number;
    locateMs: number;
    barcodeMs: number;
    previewMs: number;
  };
};
export const stateLabels = { on: '亮起', off: '未见亮起', unknown: '待确认' };
export const colorLabels = {
  red: '红色',
  amber: '黄 / 橙色',
  green: '绿色',
  none: '无',
};
export function emptyDevice(): DeviceVision {
  return {
    body: null,
    cap: null,
    lamps: lampDefinitions.map((d) => ({
      key: d.key,
      label: d.label,
      state: 'unknown',
      color: 'none',
      box: { x: 0, y: 0, width: 0, height: 0 },
      peak: 0,
      signal: 0,
      brightPixels: 0,
      reason: '尚未定位灯位',
    })),
    method: 'optical-template',
    localization: 'uncertain',
    warnings: [],
  };
}
export function setManualLampState(
  device: DeviceVision,
  key: LampKey,
  state: LampState,
): DeviceVision {
  return {
    ...device,
    lamps: device.lamps.map((lamp) => {
      if (lamp.key === key)
        return {
          ...lamp,
          state,
          color:
            state === 'on'
              ? lamp.color === 'none'
                ? 'red'
                : lamp.color
              : 'none',
          manual: true,
          reason: '人工校对灯态',
        };
      if (key !== 'power' && state === 'on' && lamp.key !== 'power')
        return {
          ...lamp,
          state: 'off',
          color: 'none',
          manual: true,
          reason: '人工确认另一结果灯亮起，按互斥规则设为未亮。',
        };
      return lamp;
    }),
  };
}
export function conclude(device: DeviceVision): Conclusion {
  const resultKeys: LampKey[] = ['negative', 'positive', 'invalid'];
  const resultLamps = device.lamps.filter((l) => resultKeys.includes(l.key));
  const states = Object.fromEntries(resultLamps.map((l) => [l.key, l.state]));
  const base = { warnings: [...device.warnings] };
  if (resultLamps.filter((l) => l.state === 'on').length > 1)
    return {
      ...base,
      code: 'conflict',
      title: '结果灯不符合互斥规则，待确认',
      summary:
        'Negative、Positive、Invalid 只应有一个亮起。当前照片无法可靠区分结果灯，请重新录入并拍摄。',
      tone: 'amber',
    };
  if (
    !device.body ||
    resultKeys.some(
      (key) => resultLamps.filter((l) => l.key === key).length !== 1,
    ) ||
    resultLamps.some((l) => l.state !== 'on' && l.state !== 'off')
  )
    return {
      ...base,
      code: 'unknown',
      title: '待确认',
      summary:
        '结果灯尚未可靠区分，可能存在串光或图像不清晰，请重新录入并拍摄。',
      tone: 'amber',
    };
  if (states.invalid === 'on')
    return {
      ...base,
      code: 'invalid',
      title: '无效指示（Invalid）',
      summary:
        'Invalid 指示灯亮起，本次显示为无效状态，不能按阴性或阳性有效结果记录。',
      tone: 'amber',
    };
  if (states.positive === 'on')
    return {
      ...base,
      code: 'positive',
      title: '阳性指示（+ Positive）',
      summary:
        '照片中 Positive 指示灯亮起，Negative 与 Invalid 未见亮起。此处汇总设备指示灯，不判定检测有效性。',
      tone: 'red',
    };
  if (states.negative === 'on')
    return {
      ...base,
      code: 'negative',
      title: '阴性指示（− Negative）',
      summary:
        '照片中 Negative 指示灯亮起，Positive 与 Invalid 未见亮起。此处汇总设备指示灯，不判定检测有效性。',
      tone: 'green',
    };
  return {
    ...base,
    code: 'unknown',
    title: '未见结果灯亮起',
    summary:
      'Positive、Negative 与 Invalid 均未见亮起，无法从当前照片确定结果。',
    tone: 'amber',
  };
}
export function needsReview(record: Inspection) {
  return (
    !record.reviewed ||
    !record.barcode ||
    conclude(record.device).code === 'unknown' ||
    conclude(record.device).code === 'conflict'
  );
}

/** Confirmation locks the captured evidence, never changes optical results. */
export function confirmInspection(
  record: Inspection,
  at = new Date(),
): Inspection {
  if (record.lockedAt) throw new Error('检测记录已保存，只能查看和导出');
  if (record.phase !== 'done' && record.phase !== 'error')
    throw new Error('请等待照片处理完成');
  if (!Number.isFinite(at.getTime())) throw new Error('确认时间无效');
  const result = conclude(record.device).code;
  const reviewed =
    record.phase === 'done' &&
    Boolean(record.barcode) &&
    result !== 'unknown' &&
    result !== 'conflict';
  return {
    ...record,
    reviewed,
    lockedAt: at.toISOString(),
    confirmedAt: at.toISOString(),
  };
}
