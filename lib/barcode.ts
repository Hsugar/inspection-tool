import { constrainBox, type PixelFrame, type Box } from './device-vision';
let configured = false;
export async function decodeBarcode(
  frame: PixelFrame,
  cap?: Box | null,
): Promise<{
  barcode: string;
  format: string;
  box: Box | null;
  error: string;
  ambiguous: boolean;
}> {
  const { prepareZXingModule, readBarcodes } =
    await import('zxing-wasm/reader');
  if (!configured && typeof self !== 'undefined') {
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? '/barcode/zxing_reader.wasm' : prefix + path,
      },
    });
    configured = true;
  }
  const options = {
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    maxNumberOfSymbols: 8,
  };
  let results = await readBarcodes(frame as ImageData, options);
  let offsetX = 0,
    offsetY = 0;
  if (!results.some((r) => !r.error && r.text) && cap) {
    // Restrict a second scan to the tube above the detected cap. The smaller
    // region gives curved/narrow bars more scan lines without inventing digits.
    const left = Math.max(0, Math.floor(cap.x - cap.width * 0.4));
    const top = Math.max(0, Math.floor(cap.y - cap.width * 4));
    const right = Math.min(frame.width, Math.ceil(cap.x + cap.width * 1.4));
    const bottom = Math.min(frame.height, Math.ceil(cap.y));
    const width = right - left,
      height = bottom - top;
    if (width > 0 && height > 0) {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        const start = ((top + y) * frame.width + left) * 4;
        data.set(frame.data.subarray(start, start + width * 4), y * width * 4);
      }
      results = await readBarcodes(
        { data, width, height } as ImageData,
        options,
      );
      offsetX = left;
      offsetY = top;
    }
  }
  const valid = results.filter((r) => !r.error && r.text);
  const unique = [...new Set(valid.map((r) => r.text))];
  if (unique.length !== 1)
    return {
      ambiguous: unique.length > 1,
      barcode: '',
      format: '',
      box: null,
      error: unique.length
        ? '照片中有多个条码，请人工确认本次试管编号。'
        : '未能解码条形码，请对照原图录入。',
    };
  const result = valid[0],
    points = Object.values(result.position),
    x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  const bounds = {
    x: x + offsetX,
    y: y + offsetY,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
  // A curved 1D code may decode on a single scan line. Give that line a
  // visible surrounding region, rather than presenting it as a zero-width box.
  const major = Math.max(bounds.width, bounds.height);
  if (bounds.width < major * 0.08) {
    bounds.x -= (major * 0.2 - bounds.width) / 2;
    bounds.width = major * 0.2;
  }
  if (bounds.height < major * 0.08) {
    bounds.y -= (major * 0.2 - bounds.height) / 2;
    bounds.height = major * 0.2;
  }
  return {
    ambiguous: false,
    barcode: result.text,
    format: result.format,
    box: constrainBox(bounds, frame.width, frame.height),
    error: '',
  };
}
