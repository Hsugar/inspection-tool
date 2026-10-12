import type { Inspection } from './inspection';
import { createWorkbook } from './export';
import {
  createStandardExport,
  type StandardExportFormat,
} from './standard-export';
import { exportAndroidFile } from './mobile-export';
import { isAndroid } from './native';

export type ExportFormat = StandardExportFormat | 'xlsx';
export const exportFormats: {
  value: ExportFormat;
  label: string;
  description: string;
}[] = [
  {
    value: 'fhir-xml',
    label: 'FHIR XML',
    description: 'HL7 FHIR R4 · 用于医疗信息系统交换',
  },
  {
    value: 'fhir-json',
    label: 'FHIR JSON',
    description: 'HL7 FHIR R4 · 用于医疗信息系统交换',
  },
  { value: 'csv', label: 'CSV', description: '统计与逐条数据 · 用于表格查看' },
  {
    value: 'xlsx',
    label: 'Excel',
    description: '含照片缩略图 · 用于人工查看与核对',
  },
];
type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{
  createWritable(): Promise<{
    write(blob: Blob): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}>;

export async function exportInspectionFile(
  records: Inspection[],
  format: ExportFormat,
  action: 'save' | 'share',
) {
  const standard =
    format === 'xlsx' ? null : createStandardExport(records, format);
  const name =
    standard?.fileName ||
    `检图_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
  const mimeType =
    standard?.mimeType.split(';')[0] ||
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  // Open the picker before asynchronous workbook generation to retain the user's gesture.
  const picker = (window as Window & { showSaveFilePicker?: SavePicker })
    .showSaveFilePicker;
  let handle: Awaited<ReturnType<SavePicker>> | undefined;
  if (!isAndroid() && picker) {
    try {
      handle = await picker.call(window, {
        suggestedName: name,
        types: [
          {
            description: exportFormats.find((item) => item.value === format)!
              .label,
            accept: { [mimeType]: [`.${name.split('.').at(-1)}`] },
          },
        ],
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError')
        return '已取消保存';
      // Some embedded browsers expose the API but deny it. Fall back to a download.
      if (
        !(
          error instanceof Error &&
          ['SecurityError', 'NotAllowedError'].includes(error.name)
        )
      )
        throw error;
    }
  }
  const blob = standard
    ? new Blob([standard.content], { type: mimeType })
    : new Blob([await (await createWorkbook(records)).xlsx.writeBuffer()], {
        type: mimeType,
      });
  if (isAndroid()) return exportAndroidFile(blob, name, mimeType, action);
  if (handle) {
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      throw error;
    }
    return '检测数据已保存到所选位置';
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return '已发起文件下载；可在浏览器下载目录找到文件并复制到 U 盘';
}
