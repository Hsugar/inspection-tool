import { orientDevice, type Box } from './device-vision';
import { decodeBarcode } from './barcode';
function canvasFor(image: ImageBitmap, max: number, rotation = 0) {
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  const w = Math.round(image.width * scale),
    h = Math.round(image.height * scale);
  const canvas = new OffscreenCanvas(
    rotation % 180 ? h : w,
    rotation % 180 ? w : h,
  );
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  return canvas;
}
self.onmessage = async (event: MessageEvent<Blob>) => {
  let original: ImageBitmap | undefined;
  try {
    const start = performance.now();
    original = await createImageBitmap(event.data);
    const loaded = performance.now();
    self.postMessage({ progress: 8, message: '定位机身与四路指示灯' });
    const small = canvasFor(original, 1024);
    const oriented = orientDevice(
      small.getContext('2d')!.getImageData(0, 0, small.width, small.height),
    );
    small.width = small.height = 0;
    const located = performance.now();
    self.postMessage({ progress: 48, message: '读取试管条形码' });
    let code: Awaited<ReturnType<typeof decodeBarcode>> = {
      barcode: '',
      format: '',
      box: null,
      error: '',
      ambiguous: false,
    };
    let barcodeBox: Box | null = null;
    let scanSize = 0;
    for (const size of [1536, 2560, 4096]) {
      scanSize = size;
      const scan = canvasFor(original, size, oriented.rotation);
      const frame = scan
        .getContext('2d')!
        .getImageData(0, 0, scan.width, scan.height);
      scan.width = scan.height = 0;
      const cap = oriented.vision.cap;
      const sx = frame.width / oriented.frame.width;
      const sy = frame.height / oriented.frame.height;
      code = await decodeBarcode(
        frame,
        cap
          ? {
              x: cap.x * sx,
              y: cap.y * sy,
              width: cap.width * sx,
              height: cap.height * sy,
            }
          : null,
      );
      if (code.box)
        barcodeBox = {
          x: (code.box.x * oriented.frame.width) / frame.width,
          y: (code.box.y * oriented.frame.height) / frame.height,
          width: (code.box.width * oriented.frame.width) / frame.width,
          height: (code.box.height * oriented.frame.height) / frame.height,
        };
      if (
        code.barcode ||
        code.ambiguous ||
        size >= Math.max(original.width, original.height)
      )
        break;
    }
    const decoded = performance.now();
    const preview = canvasFor(original, 1600, oriented.rotation);
    const thumbnail = canvasFor(original, 240, oriented.rotation);
    const previewBlob = await preview.convertToBlob({
      type: 'image/jpeg',
      quality: 0.9,
    });
    const thumbnailBlob = await thumbnail.convertToBlob({
      type: 'image/jpeg',
      quality: 0.8,
    });
    self.postMessage({
      result: {
        device: oriented.vision,
        barcode: code.barcode,
        format: code.format,
        barcodeBox,
        barcodeSource: code.barcode ? 'decoded' : 'unread',
        rotation: oriented.rotation,
        imageWidth: oriented.frame.width,
        imageHeight: oriented.frame.height,
        previewBlob,
        thumbnailBlob,
        thumbnailWidth: thumbnail.width,
        thumbnailHeight: thumbnail.height,
        error: code.error,
        runtimeStats: {
          scanSize,
          loadMs: Math.round(loaded - start),
          locateMs: Math.round(located - loaded),
          barcodeMs: Math.round(decoded - located),
          previewMs: Math.round(performance.now() - decoded),
        },
      },
    });
    preview.width = preview.height = thumbnail.width = thumbnail.height = 0;
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : '照片分析失败，请重试。',
    });
  } finally {
    original?.close();
  }
};
