import {
  analyzeDevice,
  orientDevice,
  constrainBox,
  type Box,
  type PixelFrame,
} from './device-vision';
import { decodeBarcode } from './barcode';
import type { Inspection } from './inspection';
import RecognitionWorker from './recognition.worker?worker';
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('图片无法读取，请使用 JPG、PNG 或 WebP。'));
    image.src = src;
  });
}
function canvasFor(image: HTMLImageElement, max: number, rotation = 0) {
  const scale = Math.min(1, max / Math.max(image.width, image.height)),
    w = Math.round(image.width * scale),
    h = Math.round(image.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = rotation % 180 ? h : w;
  canvas.height = rotation % 180 ? w : h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  return canvas;
}
export async function prepareImage(file: File) {
  const source = URL.createObjectURL(file);
  try {
    const image = await loadImage(source);
    if (image.width * image.height > 60000000)
      throw new Error('图片分辨率过高，请压缩至 6000 万像素以内。');
    const canvas = canvasFor(image, 240);
    const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
    const result = {
      image: source,
      // The 240px thumbnail is only for the photo list and Excel, never the stage.
      displayImage: source,
      imageWidth: Math.round(
        image.width * Math.min(1, 1024 / Math.max(image.width, image.height)),
      ),
      imageHeight: Math.round(
        image.height * Math.min(1, 1024 / Math.max(image.width, image.height)),
      ),
      thumbnail,
      thumbnailWidth: canvas.width,
      thumbnailHeight: canvas.height,
    };
    canvas.width = canvas.height = 0;
    image.src = '';
    return result;
  } catch (e) {
    URL.revokeObjectURL(source);
    throw e;
  }
}
async function recognizeOnMainThread(
  src: string,
  onProgress: (value: number, text: string) => void,
) {
  const start = performance.now();
  onProgress(8, '定位机身与四路指示灯');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const original = await loadImage(src),
    small = canvasFor(original, 1024),
    data = small
      .getContext('2d')!
      .getImageData(0, 0, small.width, small.height);
  const oriented = orientDevice(data);
  small.width = small.height = 0;
  onProgress(48, '读取试管条形码');
  await new Promise((resolve) => setTimeout(resolve, 0));
  let code: Awaited<ReturnType<typeof decodeBarcode>> = {
    barcode: '',
    format: '',
    box: null,
    error: '',
    ambiguous: false,
  };
  let sx = 1,
    sy = 1;
  try {
    // Start with a small scan; only allocate a larger frame when the code cannot be read.
    const max = Math.max(original.width, original.height);
    for (const size of [1536, 2560, 4096]) {
      const normalized = canvasFor(original, size, oriented.rotation);
      const frame = normalized
        .getContext('2d')!
        .getImageData(0, 0, normalized.width, normalized.height);
      sx = oriented.frame.width / frame.width;
      sy = oriented.frame.height / frame.height;
      normalized.width = normalized.height = 0;
      const cap = oriented.vision.cap;
      code = await decodeBarcode(
        frame,
        cap
          ? {
              x: cap.x / sx,
              y: cap.y / sy,
              width: cap.width / sx,
              height: cap.height / sy,
            }
          : null,
      );
      if (code.barcode || code.ambiguous || size >= max) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } catch {
    code = {
      barcode: '',
      format: '',
      box: null,
      error: '条码识别引擎加载失败，可重试或手动录入。',
      ambiguous: false,
    };
  }
  const barcodeBox = code.box
    ? {
        x: code.box.x * sx,
        y: code.box.y * sy,
        width: code.box.width * sx,
        height: code.box.height * sy,
      }
    : null;
  const preview = canvasFor(original, 1600, oriented.rotation);
  const thumbnail = canvasFor(original, 240, oriented.rotation);
  onProgress(100, '灯态分析完成');
  const result = {
    device: oriented.vision,
    barcode: code.barcode,
    format: code.format,
    barcodeBox,
    barcodeSource: code.barcode ? ('decoded' as const) : ('unread' as const),
    rotation: oriented.rotation,
    imageWidth: oriented.frame.width,
    imageHeight: oriented.frame.height,
    displayImage: preview.toDataURL('image/jpeg', 0.9),
    thumbnail: thumbnail.toDataURL('image/jpeg', 0.8),
    thumbnailWidth: thumbnail.width,
    thumbnailHeight: thumbnail.height,
    elapsedMs: Math.round(performance.now() - start),
    error: code.error,
  };
  preview.width = preview.height = thumbnail.width = thumbnail.height = 0;
  original.src = '';
  return result;
}
export async function analyzeManualBody(
  src: string,
  box: Box,
  imageWidth: number,
  imageHeight: number,
) {
  const image = await loadImage(src),
    canvas = document.createElement('canvas');
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  canvas.getContext('2d')!.drawImage(image, 0, 0, imageWidth, imageHeight);
  return analyzeDevice(
    canvas.getContext('2d')!.getImageData(0, 0, imageWidth, imageHeight),
    constrainBox(box, imageWidth, imageHeight),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('生成预览失败'));
    reader.readAsDataURL(blob);
  });
}
type WorkerResult = Omit<
  Awaited<ReturnType<typeof recognizeOnMainThread>>,
  'displayImage' | 'thumbnail' | 'elapsedMs'
> & {
  previewBlob: Blob;
  thumbnailBlob: Blob;
  runtimeStats?: Inspection['runtimeStats'];
};
let analysisWorker: Worker | undefined;
class WorkerUnavailableError extends Error {}
export async function recognize(
  src: string,
  onProgress: (value: number, text: string) => void,
) {
  if (
    typeof OffscreenCanvas === 'undefined' ||
    typeof createImageBitmap === 'undefined' ||
    typeof Worker === 'undefined'
  )
    return recognizeOnMainThread(src, onProgress);
  const start = performance.now();
  onProgress(2, '读取本地原图');
  const response = await fetch(src);
  if (!response.ok) throw new Error('原始照片读取失败，请重新选择照片。');
  const blob = await response.blob();
  let worker: Worker;
  try {
    // Let Vite resolve the URL; Vinext SSR rewrites import.meta.url to file://.
    worker = analysisWorker ??= new RecognitionWorker();
  } catch {
    onProgress(3, '正在使用兼容模式识别');
    return recognizeOnMainThread(src, onProgress);
  }
  let recycle = true;
  let timeout: ReturnType<typeof setTimeout>;
  try {
    const output = await new Promise<WorkerResult>((resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error('照片分析超时，请压缩图片或重新尝试。')),
        90000,
      );
      worker.onmessage = (
        event: MessageEvent<{
          progress?: number;
          message?: string;
          error?: string;
          result?: WorkerResult;
        }>,
      ) => {
        const value = event.data;
        if (value.error) reject(new Error(value.error));
        else if (value.result) resolve(value.result);
        else if (value.progress !== undefined)
          onProgress(value.progress, value.message || '分析中');
      };
      worker.onerror = () =>
        reject(new WorkerUnavailableError('识别线程加载失败'));
      worker.postMessage(blob);
    });
    const { previewBlob, thumbnailBlob, ...result } = output;
    const displayImage = await blobToDataUrl(previewBlob),
      thumbnail = await blobToDataUrl(thumbnailBlob);
    onProgress(100, '灯态分析完成');
    recycle = (result.runtimeStats?.scanSize || 0) >= 4096;
    return {
      ...result,
      displayImage,
      thumbnail,
      elapsedMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    if (!(error instanceof WorkerUnavailableError)) throw error;
    clearTimeout(timeout!);
    worker.terminate();
    analysisWorker = undefined;
    onProgress(3, '正在使用兼容模式识别');
    return recognizeOnMainThread(src, onProgress);
  } finally {
    clearTimeout(timeout!);
    worker.onmessage = null;
    worker.onerror = null;
    // Reuse the small decoder heap; recycle after full-size fallback or any error.
    if (recycle) {
      worker.terminate();
      analysisWorker = undefined;
    }
  }
}
