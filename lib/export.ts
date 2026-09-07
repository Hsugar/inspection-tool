import type { Inspection } from './inspection';
import { labels, needsReview } from './inspection';
export async function createWorkbook(records:Inspection[]) {
  const {default:ExcelJS}=await import('exceljs');
  const workbook=new ExcelJS.Workbook();workbook.creator='检图';workbook.created=new Date();
  const summary=workbook.addWorksheet('检测汇总',{views:[{state:'frozen',ySplit:1}]});
  const names=[...new Set(records.flatMap(r=>r.checks.map(c=>c.name)))];
  summary.columns=[{header:'序号',width:8},{header:'照片',width:25},{header:'文件名',width:30},{header:'条形码（文本）',width:28},{header:'条码类型',width:18},...names.map(name=>({header:name,width:16})),{header:'校对状态',width:18},{header:'处理时间',width:24},{header:'提示',width:40}];
  for(const [i,record] of records.entries()) {
    const row=summary.addRow([i+1,'',record.name,String(record.barcode),record.format,...names.map(n=>{const c=record.checks.find(c=>c.name===n);return c?labels[c.verdict]:'未提供';}),needsReview(record)?'待确认':'已校对',record.createdAt,record.error||(!record.barcode?'条形码未识别，请核对原图':'')]);
    row.height=112;row.alignment={vertical:'middle',wrapText:true};row.getCell(4).numFmt='@';
    if(record.thumbnail){const id=workbook.addImage({base64:record.thumbnail,extension:'jpeg'});summary.addImage(id,{tl:{col:1.1,row:i+1.08},ext:{width:Math.min(148/(record.thumbnailWidth||240),132/(record.thumbnailHeight||240))*(record.thumbnailWidth||240),height:Math.min(148/(record.thumbnailWidth||240),132/(record.thumbnailHeight||240))*(record.thumbnailHeight||240)},editAs:'oneCell'});}
    names.forEach((n,index)=>{const c=record.checks.find(c=>c.name===n);if(c)row.getCell(index+6).font={color:{argb:c.verdict==='pass'?'FF15803D':c.verdict==='fail'?'FFDC2626':'FF9A6700'}};});
  }
  summary.autoFilter={from:{row:1,column:1},to:{row:records.length+1,column:summary.columns.length}};
  const detail=workbook.addWorksheet('识别原文');detail.columns=[{header:'文件名',width:32},{header:'OCR 原文（未经人工修改）',width:100}];records.forEach(r=>{const row=detail.addRow([r.name,r.rawText]);row.alignment={wrapText:true,vertical:'top'};row.height=90;});
  for(const sheet of [summary,detail]){sheet.getRow(1).height=30;sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2855DC'}};}
  return workbook;
}
export async function exportExcel(records:Inspection[]) {
  const workbook=await createWorkbook(records);const buffer=await workbook.xlsx.writeBuffer();
  const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const link=document.createElement('a');link.href=url;link.download=`检测结果_${new Date().toISOString().slice(0,10)}.xlsx`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
