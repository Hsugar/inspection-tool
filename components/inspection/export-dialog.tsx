'use client';
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

export function ExportDialog({
  open,
  onClose,
  records,
  exporting,
  onExport,
}: {
  open: boolean;
  onClose: () => void;
  records: Inspection[];
  exporting: boolean;
  onExport: (format: ExportFormat, action: 'save' | 'share') => void;
}) {
  const [format, setFormat] = useState<ExportFormat>('fhir-xml');
  const summary = summarizeInspections(records);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !exporting) onClose();
      }}
    >
      <DialogContent className="export-dialog">
        <DialogTitle>导出检测数据</DialogTitle>
        <DialogDescription>
          导出当前保留的全部 {records.length} 条记录及统计。医疗系统交换请选择
          FHIR 格式。
        </DialogDescription>
        <dl className="export-metrics">
          <div>
            <dt>已完成分析</dt>
            <dd>
              {summary.completed}
              <small> 条</small>
            </dd>
          </div>
          <div>
            <dt>处理失败率</dt>
            <dd>
              {summary.processingErrorRate === null
                ? '—'
                : `${(summary.processingErrorRate * 100).toFixed(1)}%`}
            </dd>
          </div>
          <div>
            <dt>无效指示</dt>
            <dd>
              {summary.invalid}
              <small> 次</small>
            </dd>
          </div>
          <div>
            <dt>待确认记录</dt>
            <dd>
              {summary.needsReview}
              <small> 条</small>
            </dd>
          </div>
        </dl>
        <p className="export-note">
          处理失败 {summary.failed} 条 ÷ 处理结束{' '}
          {summary.completed + summary.failed}{' '}
          条；此比率不代表临床误判率。无效指示与待确认可重叠。统计仅覆盖当前保留记录，删除与重新识别会改变统计，不代表设备累计使用次数。
        </p>
        <fieldset className="export-formats" disabled={exporting}>
          <legend>选择文件格式</legend>
          {exportFormats.map((item) => (
            <label
              aria-label={`${item.label} · ${item.description}`}
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
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="export-destination">
          <strong>保存到本机或 U 盘</strong>
          <p>
            {isAndroid()
              ? '连接 OTG / U 盘后，在系统保存位置中选择它。可用位置取决于手机及文件管理器；也可先保存到下载目录再复制。'
              : '支持的浏览器可直接选择本机目录或 U 盘；其他浏览器会下载文件，之后可复制到 U 盘。'}
          </p>
        </div>
        <p className="export-note">
          FHIR
          包含灯态、条码、校对状态和统计；未确认结果保留待确认标记。当前为本地设备指示编码，接入具体医院系统时需匹配其数据规范。
        </p>
        <div className="export-dialog-actions">
          {isAndroid() && (
            <button
              className="button secondary"
              disabled={exporting || !records.length}
              onClick={() => onExport(format, 'share')}
            >
              <Share2 size={17} />
              分享文件
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
            {exporting ? '正在导出…' : '保存文件'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
