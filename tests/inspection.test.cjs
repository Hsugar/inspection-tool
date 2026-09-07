const assert = require('node:assert/strict');
const { parseChecks, needsReview, validateChecks } = require('../.test-build/inspection.js');
const {createWorkbook} = require('../.test-build/export.js');
const test = require('node:test');
test('Chinese and English, mixed lines, failures are never matched as pass',()=>{
 assert.deepEqual(parseChecks('A 通过 B 不通过 P 通过'),[{name:'A',verdict:'pass'},{name:'B',verdict:'fail'},{name:'P',verdict:'pass'}]);
 assert.deepEqual(parseChecks('A: PASS\nB: NOT PASS\nP: NG').map(c=>c.verdict),['pass','fail','fail']);
 assert.equal(parseChecks('A 不 通 过')[0].verdict,'fail');
 assert.equal(parseChecks('A 未检测')[0].verdict,'unknown');
 assert.equal(parseChecks('A 通过\nA 不通过')[0].verdict,'unknown');
 assert.ok(parseChecks('barcode 00123456').every(c=>c.verdict==='unknown'));
 assert.equal(parseChecks('A ✅ B ❌ P ✔')[1].verdict,'fail');
});
test('review requires barcode and all checks; duplicate names rejected',()=>{
 assert.ok(validateChecks([{name:'A',verdict:'pass'},{name:'a',verdict:'pass'}]));
 assert.ok(validateChecks([]));
 assert.ok(needsReview({reviewed:true,barcode:'',checks:[{name:'A',verdict:'pass'}]}));
 assert.ok(needsReview({reviewed:true,barcode:'0123',checks:[{name:'A',verdict:'unknown'}]}));
});
test('xlsx round trip retains leading zeros, Unicode, embedded photos, and unknown results',async()=>{
 const fs=require('node:fs');
 const image='data:image/jpeg;base64,'+fs.readFileSync('test-output/fixture.jpg').toString('base64');
 const record={id:'1',name:'=HYPERLINK("bad")',image:'',thumbnail:image,thumbnailWidth:240,thumbnailHeight:200,barcode:'001234567890',format:'CODE_128',checks:parseChecks('A 通过 B 不通过 P 待确认'),rawText:'A 通过 B 不通过 P 待确认',phase:'done',error:'',reviewed:false,createdAt:'2026/09/07'};
 const workbook=await createWorkbook([record,{...record,id:'2',name:'second.jpg',barcode:'00001234'}]);
 const data=await workbook.xlsx.writeBuffer();await fs.promises.writeFile('test-output/results.xlsx',data);
 const ExcelJS=require('exceljs');const roundtrip=new ExcelJS.Workbook();await roundtrip.xlsx.load(data);
 const sheet=roundtrip.getWorksheet('检测汇总');
 assert.equal(sheet.getCell('D2').value,'001234567890');assert.equal(sheet.getCell('D3').value,'00001234');
 assert.equal(sheet.getCell('C2').type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('G2').value,'❌ 不通过');
 assert.equal(sheet.getCell('H2').value,'待确认');assert.equal(sheet.getImages().length,2);
});
