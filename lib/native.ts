import { Capacitor, registerPlugin } from '@capacitor/core';
export const isAndroid = () => Capacitor.getPlatform() === 'android';
export interface NativeRecord {
  id: string;
  json: string;
  imageUri: string;
}
export const InspectionNative = registerPlugin<{
  pickPhotos(): Promise<{
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
}>('InspectionNative');
export async function pickAndroidPhotos(): Promise<File[]> {
  const { photos } = await InspectionNative.pickPhotos();
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
    return files;
  } finally {
    await InspectionNative.clearImports();
  }
}
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(blob);
  });
}
