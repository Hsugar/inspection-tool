'use client';
import { useEffect, useRef, useState } from 'react';
import { ScanLine, Upload, FileSpreadsheet, Images, ShieldCheck, ArrowRight, ScanBarcode, Pencil, RotateCcw, Trash2, Plus, LoaderCircle, Maximize2, CircleAlert, CheckCheck } from 'lucide-react';
import { Empty, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { labels, needsReview, validateChecks, type Inspection, type Check, type Verdict } from '@/lib/inspection';
import { prepareImage, recognize } from '@/lib/recognition';
import { exportExcel } from '@/lib/export';

export default function Home() {
  const [records,setRecords]=useState<Inspection[]>([]);
  const [busy,setBusy]=useState(false),[exporting,setExporting]=useState(false),[drag,setDrag]=useState(false);
  const [notice,setNotice]=useState(''),[progress,setProgress]=useState(0),[message,setMessage]=useState('');
  const [edit,setEdit]=useState<Inspection|null>(null),[preview,setPreview]=useState<Inspection|null>(null),[editError,setEditError]=useState('');
  const input=useRef<HTMLInputElement>(null),busyRef=useRef(false),recordsRef=useRef(records),urls=useRef(new Set<string>());
  recordsRef.current=records;
  const patch=(id:string,update:Partial<Inspection>)=>setRecords(current=>current.map(r=>r.id===id?{...r,...update}:r));
  useEffect(()=>()=>{urls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  useEffect(()=>{const onLeave=(event:BeforeUnloadEvent)=>{if(recordsRef.current.length){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',onLeave);return()=>window.removeEventListener('beforeunload',onLeave);},[]);
  useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context)return;const controller=new AbortController();
    Promise.resolve(context.registerTool({name:'read_inspection_results',title:'读取图片检测结果',description:'读取当前页面的条形码、检测项和校对状态，不含照片。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:(input:unknown)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('参数必须为空对象');return recordsRef.current.map(({id,name,barcode,checks,reviewed,phase})=>({id,name,barcode,checks,reviewed,phase}));}},{signal:controller.signal})).catch(()=>{});
    return()=>controller.abort();
  },[]);
  async function process(items:Inspection[]) {
    for(const [index,item] of items.entries()){
      patch(item.id,{phase:'reading'});setProgress(0);setMessage(`第 ${index+1} / ${items.length} 张 · 正在读取条形码`);
      try {const result=await recognize(item.image,(value,text)=>{setProgress(value);setMessage(`第 ${index+1} / ${items.length} 张 · ${text}`);});patch(item.id,{...result,phase:result.error?'error':'done',reviewed:false});}
      catch(e){patch(item.id,{phase:'error',error:e instanceof Error?e.message:'识别失败，可手动校对。'});}
    }
  }
  async function upload(files:FileList|File[]) {
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setNotice('');
    const errors:string[]=[];const batch:Inspection[]=[];
    try {
      const room=30-recordsRef.current.length;const incoming=Array.from(files);
      if(incoming.length>room)errors.push(`最多保留 30 张，本次只接收前 ${Math.max(room,0)} 张。`);
      for(const file of incoming.slice(0,Math.max(0,room))){
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)){errors.push(`${file.name}：仅支持 JPG、PNG、WebP。`);continue;}
        if(file.size>20*1024*1024){errors.push(`${file.name}：超过 20 MB。`);continue;}
        try{const media=await prepareImage(file);urls.current.add(media.image);batch.push({id:crypto.randomUUID(),name:file.name,...media,barcode:'',format:'',checks:['A','B','P'].map(name=>({name,verdict:'unknown'})),rawText:'',phase:'queued',error:'',reviewed:false,createdAt:new Date().toLocaleString('zh-CN',{hour12:false})});}catch(e){errors.push(`${file.name}：${e instanceof Error?e.message:'无法读取'}`);}
      }
      setRecords(current=>[...current,...batch]);setNotice(errors.join('\n'));await process(batch);
    }finally{busyRef.current=false;setBusy(false);setMessage('');}
  }
  async function retry(record:Inspection){if(busyRef.current)return;busyRef.current=true;setBusy(true);try{await process([record]);}finally{busyRef.current=false;setBusy(false);setMessage('');}}
  function remove(record:Inspection){setRecords(current=>current.filter(r=>r.id!==record.id));URL.revokeObjectURL(record.image);urls.current.delete(record.image);}
  async function download(){setExporting(true);setNotice('');try{await exportExcel(records);}catch{setNotice('Excel 导出失败，请重试。照片仍保留在当前页面。');}finally{setExporting(false);}}
  function saveEdit(){if(!edit)return;const error=validateChecks(edit.checks);if(error){setEditError(error);return;}patch(edit.id,{barcode:edit.barcode.trim(),format:edit.format,checks:edit.checks.map(c=>({...c,name:c.name.trim().toUpperCase()})),reviewed:true});setEdit(null);}
  function changeCheck(index:number,update:Partial<Check>){setEdit(value=>value?{...value,checks:value.checks.map((c,i)=>i===index?{...c,...update}:c)}:value);}
  const pending=records.filter(needsReview).length;
  return <div className="app-shell"><header className="topbar"><a href="/" className="brand"><span className="brand-icon"><ScanLine size={23}/></span>检图<span className="brand-divider"/>图片检测工作台</a><span className="local-badge"><ShieldCheck size={16}/>本机处理 · 照片不上传云端</span></header><main>
    <div className="heading"><div><div className="eyebrow">INSPECTION WORKSPACE</div><h1>让每一张检测照片，<br className="mobile-break"/>都有清晰的结果。</h1><p>上传照片，提取条形码与检测信息，一键整理为 Excel。</p></div><button className="button secondary" onClick={download} disabled={!records.length||busy||exporting}>{exporting?<LoaderCircle className="spin" size={18}/>:<FileSpreadsheet size={18}/>} {exporting?'正在生成…':`导出 Excel${records.length?`（${records.length}）`:''}`}</button></div>
    <section className={`upload-zone ${drag?'dragging':''} ${records.length?'compact':''}`} onDragOver={event=>{event.preventDefault();if(!busy)setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={event=>{event.preventDefault();setDrag(false);void upload(event.dataTransfer.files);}} aria-label="图片上传区">
      <span className="upload-icon"><Upload size={26}/></span><div className="upload-copy"><h2>{busy?'正在处理检测照片':'把检测照片拖到这里'}</h2><p>支持 JPG、PNG、WebP，可一次选择多张照片</p></div><div className="upload-action"><button className="button primary" disabled={busy||exporting||records.length>=30} onClick={()=>input.current?.click()}>{busy?<LoaderCircle className="spin" size={17}/>:null}{records.length?'继续添加照片':'选择照片'} {!busy&&<ArrowRight size={17}/>}</button><span className="small-note">单张不超过 20 MB · 最多 30 张</span></div><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" aria-label="选择检测照片" onChange={event=>{if(event.target.files)void upload(event.target.files);event.target.value='';}}/>
    </section>
    {busy&&<div className="processing" role="status"><span><LoaderCircle size={16} className="spin"/>{message||'正在读取照片…'}</span><Progress value={progress} aria-label="当前照片文字识别进度"/></div>}
    {notice&&<div className="notice" role="alert"><CircleAlert size={18}/><span>{notice}</span></div>}
    <div className="section-heading"><h2>检测结果 <span className="count">{records.length}</span></h2><span>{records.length?<>{records.length-pending} 张已校对 <span className="dot-separator">/</span> <span className="amber">{pending} 张待确认</span></>:'照片与结果，一一对应'}</span></div>
    {!records.length?<section className="results-empty"><Empty><Images size={35} strokeWidth={1.4}/><EmptyTitle className="text-base">等待第一张检测照片</EmptyTitle><EmptyDescription>上传后，这里会显示原图、条形码和每个检测项的结果。</EmptyDescription></Empty></section>:<div className="results-grid">{records.map((record,index)=><article className="result-card" key={record.id}>
      <div className="card-top"><span className="photo-number">PHOTO {String(index+1).padStart(2,'0')}</span><span className={`review-badge ${needsReview(record)?'pending':'reviewed'}`}>{record.phase==='queued'?'等待识别':record.phase==='reading'?'识别中':needsReview(record)?'待确认':'已校对'}</span></div>
      <button className="photo-preview" onClick={()=>setPreview(record)} aria-label={`放大查看 ${record.name}`}><img src={record.image} alt={`检测照片：${record.name}`}/><span className="zoom-label"><Maximize2 size={14}/>查看原图</span></button>
      <div className="card-body"><div className="file-name" title={record.name}>{record.name}</div><div className="barcode-box"><ScanBarcode size={23}/><div><span className="field-label">条形码 {record.format&&<span>· {record.format}</span>}</span><strong className={!record.barcode?'missing':''}>{record.barcode||'未识别，请校对录入'}</strong></div></div><div className="checks">{record.checks.map((check,i)=><div className="check-row" key={`${check.name}-${i}`}><span className="check-name">{check.name}</span><span className={`verdict ${check.verdict}`}>{labels[check.verdict]}</span></div>)}</div>
      {record.error&&<p className="card-error">文字识别未完成，可重试或手动录入。</p>}
      <div className="card-actions"><button className="edit-button" disabled={busy||exporting} onClick={()=>{setEdit({...record,checks:record.checks.map(c=>({...c}))});setEditError('');}}><Pencil size={14}/>校对结果</button><div><button className="icon-button" aria-label={`重新识别 ${record.name}`} title="重新识别（会替换校对结果）" disabled={busy||exporting||record.reviewed} onClick={()=>void retry(record)}><RotateCcw size={16}/></button><button className="icon-button" aria-label={`移除 ${record.name}`} title="移除此照片" disabled={busy||exporting} onClick={()=>remove(record)}><Trash2 size={16}/></button></div></div></div>
    </article>)}</div>}
    <footer><span>✅ 通过 <i/> ❌ 不通过 <i/> <span className="amber">待确认</span></span><span>仅保留在当前页面，请在关闭前导出。识别后请核对原图。</span></footer>
    <Dialog open={!!preview} onOpenChange={open=>{if(!open)setPreview(null);}}><DialogContent className="image-dialog"><DialogTitle>{preview?.name}</DialogTitle><DialogDescription>原图预览 · 可在校对结果中修改条形码和检测项。</DialogDescription>{preview&&<img src={preview.image} alt={preview.name}/>}</DialogContent></Dialog>
    <Dialog open={!!edit} onOpenChange={open=>{if(!open)setEdit(null);}}><DialogContent className="edit-dialog"><DialogTitle>校对检测结果</DialogTitle><DialogDescription>对照原图核对条形码和检测项，无法确认的内容请保留“待确认”。</DialogDescription>{edit&&<><div className="edit-layout"><a className="edit-photo" href={edit.image} target="_blank" rel="noreferrer" title="在新标签页查看原图"><img src={edit.image} alt={edit.name}/><span>点击查看完整原图 ↗</span></a><div className="edit-fields"><label className="form-label" htmlFor="barcode">条形码</label><input id="barcode" className="text-input mono" value={edit.barcode} placeholder="输入原图上的条形码" onChange={e=>setEdit({...edit,barcode:e.target.value,format:e.target.value===edit.barcode?edit.format:'手动录入'})}/><div className="edit-section-title">检测项</div>{edit.checks.map((check,index)=><div className="edit-check" key={index}><input className="text-input" aria-label={`检测项 ${index+1} 名称`} maxLength={30} value={check.name} onChange={e=>changeCheck(index,{name:e.target.value})}/><Select value={check.verdict} onValueChange={value=>{if(value)changeCheck(index,{verdict:value as Verdict});}}><SelectTrigger aria-label={`${check.name} 检测结果`} className="verdict-select"><SelectValue>{labels[check.verdict]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(labels).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><button className="icon-button" aria-label={`删除检测项 ${check.name}`} onClick={()=>setEdit({...edit,checks:edit.checks.filter((_,i)=>i!==index)})}><Trash2 size={16}/></button></div>)}<button className="edit-button add-check" onClick={()=>setEdit({...edit,checks:[...edit.checks,{name:'',verdict:'unknown'}]})}><Plus size={15}/>添加检测项</button><details className="raw-text"><summary>查看识别原文</summary><pre>{edit.rawText||'未识别到文字，可手动补充结果。'}</pre></details></div></div>{editError&&<p className="card-error" role="alert">{editError}</p>}<div className="dialog-actions"><button className="button secondary" onClick={()=>setEdit(null)}>取消</button><button className="button primary" onClick={saveEdit}><CheckCheck size={17}/>保存校对</button></div></>}</DialogContent></Dialog>
  </main></div>;
}
