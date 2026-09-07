const path=require('node:path');
const assert=require('node:assert/strict');
const {createWorker}=require('tesseract.js');
const {parseChecks}=require('../.test-build/inspection.js');
(async()=>{const worker=await createWorker(['chi_sim','eng'],1,{langPath:path.resolve('public/ocr/lang'),cachePath:path.resolve('test-output'),cacheMethod:'none'});try{const {data}=await worker.recognize('test-output/fixture.png');console.log('OCR text:',data.text);assert.deepEqual(parseChecks(data.text).map(c=>c.verdict),['pass','fail','pass']);console.log('Actual OCR passed');}finally{await worker.terminate();}})().catch(e=>{console.error(e);process.exitCode=1;});
