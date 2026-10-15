'use client';
/* oxlint-disable next/no-img-element -- Bundled branding must work offline in the shared Android build. */
import { useState } from 'react';
import { Download, LoaderCircle, Share2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { exportFormats, type ExportFormat } from '@/lib/file-export';
import { summarizeInspections } from '@/lib/standard-export';
import type { Inspection } from '@/lib/inspection';
import { isAndroid } from '@/lib/native';

const exportCopy = {
  en: {
    title: 'Export Data',
    completed: 'Analyzed',
    errorRate: 'Processing failure rate',
    invalid: 'Invalid indication',
    review: 'Needs confirmation',
    format: 'File format',
    destination: 'Save to this device or a USB drive',
    androidDestination:
      'Connect a USB drive with an OTG adapter, then select it in the system save dialog. Available locations depend on your phone and file manager. You can also save to Downloads and copy the file.',
    webDestination:
      'Supported browsers let you choose a local folder or USB drive. Other browsers download the file, which you can then copy to a USB drive.',
    privacy:
      'The export contains patient information, specimen IDs, results, and confirmation status. Store and share it only with authorized people.',
    interoperability:
      'HL7 / FHIR exports use local device result codes. Integration with a hospital system requires matching that system’s interface specification. Unconfirmed results remain marked for confirmation.',
    share: 'Share file',
    save: 'Save file',
    exporting: 'Exporting…',
  },
  zh: {
    title: '导出数据',
    completed: '已完成分析',
    errorRate: '处理失败率',
    invalid: '无效指示',
    review: '待确认记录',
    format: '选择文件格式',
    destination: '保存到本机或 U 盘',
    androidDestination:
      '连接 OTG / U 盘后，在系统保存位置中选择它。可用位置取决于手机及文件管理器；也可先保存到下载目录再复制。',
    webDestination:
      '支持的浏览器可直接选择本机目录或 U 盘；其他浏览器会下载文件，之后可复制到 U 盘。',
    privacy:
      '导出文件包含患者信息、样本编号、检测结果和确认状态。请妥善保管，仅与获授权人员分享。',
    interoperability:
      'HL7 / FHIR 导出使用本地设备结果编码，接入医院系统时需匹配其接口规范。未确认结果保留待确认标记。',
    share: '分享文件',
    save: '保存文件',
    exporting: '正在导出…',
  },
} as const;

const englishFormats: Record<string, { label: string; description: string }> = {
  'hl7-v2': {
    label: 'HL7 v2',
    description: 'HL7 ORU result message · Healthcare system exchange',
  },
  'fhir-xml': {
    label: 'FHIR XML',
    description: 'HL7 FHIR R4 · Healthcare system exchange',
  },
  'fhir-json': {
    label: 'FHIR JSON',
    description: 'HL7 FHIR R4 · Healthcare system exchange',
  },
  csv: {
    label: 'CSV',
    description: 'Records and statistics · Spreadsheet data',
  },
  xlsx: {
    label: 'Excel',
    description: 'Patient data and photo thumbnails · Review and archiving',
  },
};

export function ExportDialog({
  open,
  onClose,
  records,
  exporting,
  onExport,
  language = 'en',
  scope = 'all',
  initialFormat = 'xlsx',
}: {
  open: boolean;
  onClose: () => void;
  records: Inspection[];
  exporting: boolean;
  onExport: (format: ExportFormat, action: 'save' | 'share') => void;
  language?: 'en' | 'zh';
  scope?: 'selected' | 'all';
  initialFormat?: ExportFormat;
}) {
  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const summary = summarizeInspections(records);
  const copy = exportCopy[language];
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !exporting) onClose();
      }}
    >
      <DialogContent className="export-dialog">
        <img
          className="dialog-brand"
          src="/brand/gendx-logo-compact.png"
          alt="GenDx"
        />
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>
          {language === 'en'
            ? `Export ${records.length} ${scope === 'selected' ? 'selected' : 'available'} record${records.length === 1 ? '' : 's'}, with patient information and statistics.`
            : `导出${scope === 'selected' ? '已选中的' : '当前可导出的'} ${records.length} 条记录，包含患者信息及统计。`}
        </DialogDescription>
        <dl className="export-metrics">
          <div>
            <dt>{copy.completed}</dt>
            <dd>{summary.completed}</dd>
          </div>
          <div>
            <dt>{copy.errorRate}</dt>
            <dd>
              {summary.processingErrorRate === null
                ? '—'
                : `${(summary.processingErrorRate * 100).toFixed(1)}%`}
            </dd>
          </div>
          <div>
            <dt>{copy.invalid}</dt>
            <dd>{summary.invalid}</dd>
          </div>
          <div>
            <dt>{copy.review}</dt>
            <dd>{summary.needsReview}</dd>
          </div>
        </dl>
        <p className="export-note">
          {language === 'en'
            ? `Processing failures: ${summary.failed} of ${summary.completed + summary.failed} finished attempts. This is not a clinical error rate. Invalid indications may also need confirmation. Statistics cover only the ${records.length} records in this export.`
            : `处理失败 ${summary.failed} 条 ÷ 处理结束 ${summary.completed + summary.failed} 条；此比率不代表临床误判率。无效指示与待确认可重叠。统计仅覆盖本次导出的 ${records.length} 条记录。`}
        </p>
        <fieldset className="export-formats" disabled={exporting}>
          <legend>{copy.format}</legend>
          {exportFormats.map((item) => {
            const label =
              language === 'en' ? englishFormats[item.value] || item : item;
            return (
              <label
                aria-label={`${label.label} · ${label.description}`}
                className={`export-format ${format === item.value ? 'selected' : ''}`}
                key={item.value}
              >
                <input
                  type="radio"
                  name="export-format"
                  value={item.value}
                  checked={format === item.value}
                  onChange={() => setFormat(item.value)}
                />
                <span>
                  <strong>{label.label}</strong>
                  <small>{label.description}</small>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div className="export-destination">
          <strong>{copy.destination}</strong>
          <p>{isAndroid() ? copy.androidDestination : copy.webDestination}</p>
        </div>
        <p className="export-note">{copy.interoperability}</p>
        <p className="export-note">{copy.privacy}</p>
        <div className="export-dialog-actions">
          {isAndroid() && (
            <button
              className="button secondary"
              disabled={exporting || !records.length}
              onClick={() => onExport(format, 'share')}
            >
              <Share2 size={17} />
              {copy.share}
            </button>
          )}
          <button
            className="button primary"
            disabled={exporting || !records.length}
            onClick={() => onExport(format, 'save')}
          >
            {exporting ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Download size={17} />
            )}
            {exporting ? copy.exporting : copy.save}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
