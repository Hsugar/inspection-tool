import {
  conclude,
  needsReview,
  stateLabels,
  colorLabels,
  type Inspection,
} from './inspection';
import { lampDefinitions } from './device-vision';
export async function createWorkbook(records: Inspection[]) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '检图';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('检测汇总', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: '序号', width: 8 },
    { header: '照片', width: 25 },
    { header: '文件名', width: 28 },
    { header: '试管条形码（文本）', width: 28 },
    { header: '条码来源', width: 18 },
    { header: '综合指示', width: 30 },
    ...lampDefinitions.map((l) => ({
      header: l.key === 'power' ? 'Power（电源，仅展示）' : l.label,
      width: 22,
    })),
    { header: '人工校对', width: 15 },
    { header: '处理耗时(ms)', width: 16 },
    { header: '处理时间', width: 24 },
    { header: '核对提示', width: 60 },
  ];
  for (const [i, r] of records.entries()) {
    const result = conclude(r.device);
    const row = sheet.addRow([
      i + 1,
      '',
      r.name,
      String(r.barcode),
      r.barcodeSource === 'decoded'
        ? `${r.format} 解码`
        : r.barcodeSource === 'manual'
          ? '人工录入'
          : '未识别',
      result.title,
      ...lampDefinitions.map((d) => {
        const lamp = r.device.lamps.find((l) => l.key === d.key);
        return lamp
          ? `${d.key === 'power' && lamp.state === 'unknown' ? '未识别' : stateLabels[lamp.state]}${lamp.state === 'on' ? `（${colorLabels[lamp.color]}）` : ''}${lamp.manual ? ' · 人工校对' : ''}`
          : d.key === 'power'
            ? '未识别'
            : '待确认';
      }),
      needsReview(r) ? '待确认' : '已校对',
      r.elapsedMs,
      r.createdAt,
      [r.error, ...result.warnings].filter(Boolean).join('\n'),
    ]);
    row.height = 112;
    row.alignment = { vertical: 'middle', wrapText: true };
    row.getCell(4).numFmt = '@';
    if (r.thumbnail) {
      const id = workbook.addImage({ base64: r.thumbnail, extension: 'jpeg' }),
        scale = Math.min(148 / r.thumbnailWidth, 132 / r.thumbnailHeight);
      sheet.addImage(id, {
        tl: { col: 1.1, row: i + 1.08 },
        ext: {
          width: r.thumbnailWidth * scale,
          height: r.thumbnailHeight * scale,
        },
        editAs: 'oneCell',
      });
    }
  }
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, records.length + 1), column: sheet.columns.length },
  };
  const detail = workbook.addWorksheet('灯态分析明细');
  detail.columns = [
    { header: '文件名', width: 28 },
    { header: '试管条码', width: 26 },
    { header: '灯位', width: 20 },
    { header: '状态', width: 15 },
    { header: '颜色', width: 15 },
    { header: '峰值(0–255)', width: 18 },
    { header: '高亮像素数', width: 18 },
    { header: '信号色差', width: 16 },
    { header: '判定依据', width: 46 },
    { header: '坐标(x,y,w,h)', width: 40 },
    { header: '分析方法', width: 28 },
  ];
  for (const r of records)
    for (const lamp of r.device.lamps) {
      const row = detail.addRow([
        r.name,
        String(r.barcode),
        lamp.key === 'power' ? 'Power（电源，仅展示）' : lamp.label,
        lamp.key === 'power' && lamp.state === 'unknown'
          ? '未识别'
          : stateLabels[lamp.state],
        colorLabels[lamp.color],
        lamp.peak,
        lamp.brightPixels,
        lamp.signal,
        lamp.reason,
        JSON.stringify(lamp.box),
        lamp.manual ? '人工校对' : '本地光学 / 设备模板',
      ]);
      row.getCell(2).numFmt = '@';
    }
  for (const s of [sheet, detail]) {
    s.getRow(1).height = 30;
    s.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    s.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF163657' },
    };
  }
  return workbook;
}
export async function exportExcel(records: Inspection[]) {
  const workbook = await createWorkbook(records),
    buffer = await workbook.xlsx.writeBuffer(),
    url = URL.createObjectURL(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
  const a = document.createElement('a');
  a.href = url;
  a.download = `设备灯态检测_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
