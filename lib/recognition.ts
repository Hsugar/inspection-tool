import { parseChecks } from './inspection';
import type { Worker } from 'tesseract.js';
let workerPromise: Promise<Worker> | undefined;
let reportProgress: (value:number,message:string)=>void = ()=>{};
async function getWorker() {
  workerPromise ??= import('tesseract.js').then(({createWorker})=>createWorker(['chi_sim','eng'],1,{
    workerPath:'/ocr/worker.min.js', corePath:'/ocr/core', langPath:'/ocr/lang',
    logger:m=>reportProgress(m.status==='recognizing text'?Math.round(m.progress*100):0,m.status==='recognizing text'?'正在识别检测文字':'正在加载识别模型，首次使用请稍候'),
  })).catch(e=>{workerPromise=undefined;throw e;});
  return workerPromise;
}
function withTimeout<T>(task:Promise<T>,ms:number):Promise<T> { return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('识别超时，请重试或手动录入。')),ms);task.then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)});}); }
export function loadImage(src:string):Promise<HTMLImageElement> {return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('图片无法读取，请使用 JPG、PNG 或 WebP。'));image.src=src;});}
export async function prepareImage(file:File) {
  const source=URL.createObjectURL(file);
  try {
    const image=await loadImage(source);
    if(image.width*image.height>60000000)throw new Error('图片分辨率过高，请压缩至 6000 万像素以内。');
    const canvas=document.createElement('canvas');
    const ratio=Math.min(1,240/Math.max(image.width,image.height));canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return {image:source,thumbnail:canvas.toDataURL('image/jpeg',.8),thumbnailWidth:canvas.width,thumbnailHeight:canvas.height};
  }catch(e){URL.revokeObjectURL(source);throw e;}
}
export async function recognize(src:string,onProgress:typeof reportProgress) {
  reportProgress=onProgress;
  let barcode='',format='',error='',rawText='';
  const image=await loadImage(src);
  const [{BrowserMultiFormatReader},{DecodeHintType,BarcodeFormat}]=await Promise.all([import('@zxing/browser'),import('@zxing/library')]);
  const reader=new BrowserMultiFormatReader(new Map([[DecodeHintType.TRY_HARDER,true]]));
  // Try rotations and smaller versions; decode real barcode pixels, never guess from OCR digits.
  for(const angle of [0,90]){
    if(barcode)break;
    for(const max of [2400,1200]){
      const scale=Math.min(1,max/Math.max(image.width,image.height));
      const w=Math.round(image.width*scale),h=Math.round(image.height*scale);
      const canvas=document.createElement('canvas');canvas.width=angle?h:w;canvas.height=angle?w:h;
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      if(angle){ctx.translate(h,0);ctx.rotate(Math.PI/2);}ctx.drawImage(image,0,0,w,h);
      try{const result=reader.decodeFromCanvas(canvas);barcode=result.getText();format=BarcodeFormat[result.getBarcodeFormat()];break;}catch{/* No code found at this scale. */}
    }
  }
  onProgress(0,'正在识别检测文字');
  try {
    const worker=await withTimeout(getWorker(),90000);
    const canvas=document.createElement('canvas');const scale=Math.min(1,3200/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const result=await withTimeout(worker.recognize(canvas),90000);rawText=result.data.text;
  }catch(e){error=e instanceof Error?e.message:'文字识别失败，可手动录入。';const previous=workerPromise;workerPromise=undefined;void previous?.then(w=>w.terminate()).catch(()=>{});}
  return {barcode,format,rawText,checks:parseChecks(rawText),error};
}
