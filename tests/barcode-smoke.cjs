const {RGBLuminanceSource,HybridBinarizer,BinaryBitmap,MultiFormatReader,DecodeHintType}=require('@zxing/library');
const data=new Uint8ClampedArray(require('node:fs').readFileSync('test-output/fixture.gray'));
const reader=new MultiFormatReader();reader.setHints(new Map([[DecodeHintType.TRY_HARDER,true]]));
const value=reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(data,1200,1000)))).getText();
require('node:assert/strict').equal(value,'001234567890');console.log('Actual Code 128 barcode decoding passed:',value);
