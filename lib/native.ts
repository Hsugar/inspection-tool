import { Capacitor, registerPlugin } from '@capacitor/core';
export const isAndroid = () => Capacitor.getPlatform() === 'android';
export interface NativeRecord {
  id: string;
  json: string;
  imageUri: string;
}
export interface PhotoPickerOptions {
  /** Omit to preserve the existing multi-photo picker behavior. */
  multiple?: boolean;
}
export const InspectionNative = registerPlugin<{
  pickPhotos(options?: PhotoPickerOptions): Promise<{
    photos: { path: string; name: string; type: string }[];
  }>;
  takePhoto(): Promise<{
    photos: { path: string; name: string; type: string }[];
  }>;
  clearImports(): Promise<void>;
  listRecords(): Promise<{ records: NativeRecord[]; errors: string[] }>;
  putRecord(options: {
    id: string;
    json: string;
    imageBase64?: string;
  }): Promise<void>;
  deleteRecord(options: { id: string }): Promise<void>;
  saveExcel(options: {
    name: string;
    path: string;
  }): Promise<{ cancelled: boolean }>;
  saveExport(options: {
    name: string;
    path: string;
    mimeType: string;
  }): Promise<{ cancelled: boolean }>;
  shareExport(options: {
    name: string;
    path: string;
    mimeType: string;
  }): Promise<{ cancelled: boolean }>;
}>('InspectionNative');
export async function pickAndroidPhotos(
  options?: PhotoPickerOptions,
): Promise<File[]> {
  const { photos } = await InspectionNative.pickPhotos(options);
  return readNativePhotos(photos);
}
export async function takeAndroidPhoto(): Promise<File[]> {
  const { photos } = await InspectionNative.takePhoto();
  return readNativePhotos(photos);
}
async function readNativePhotos(
  photos: { path: string; name: string; type: string }[],
): Promise<File[]> {
  const files: File[] = [];
  try {
    for (const photo of photos) {
      const response = await fetch(Capacitor.convertFileSrc(photo.path));
      if (!response.ok) throw new Error('无法读取所选照片');
      files.push(
        new File([await response.blob()], photo.name, { type: photo.type }),
      );
    }
  } catch (error) {
    // Preserve the actionable read error if temporary-file cleanup also fails.
    await InspectionNative.clearImports().catch(() => undefined);
    throw error;
  }
  await InspectionNative.clearImports();
  return files;
}
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('文件读取失败'));
        return;
      }
      resolve(reader.result.split(',')[1]);
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(blob);
  });
}
