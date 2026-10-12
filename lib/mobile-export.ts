import { Filesystem, Directory } from '@capacitor/filesystem';
import { InspectionNative, blobToBase64 } from './native';
import { createWorkbook } from './export';
import type { Inspection } from './inspection';
export async function exportAndroidFile(
  blob: Blob,
  name: string,
  mimeType: string,
  action: 'save' | 'share',
) {
  const file = await Filesystem.writeFile({
    path: `exports/${name}`,
    directory: Directory.Cache,
    data: await blobToBase64(blob),
    recursive: true,
  });
  // Cleanup must never prevent saving a newly generated export.
  try {
    const previous = await Filesystem.readdir({
      path: 'exports',
      directory: Directory.Cache,
    });
    for (const item of previous.files)
      if (item.name !== name && item.mtime < Date.now() - 24 * 60 * 60 * 1000)
        await Filesystem.deleteFile({
          path: `exports/${item.name}`,
          directory: Directory.Cache,
        });
  } catch {
    /* A cache cleanup failure does not affect the export. */
  }
  if (action === 'share') {
    const result = await InspectionNative.shareExport({
      name,
      path: file.uri,
      mimeType,
    });
    return result.cancelled ? '已取消分享' : '已交给所选应用，请在接收应用中确认';
  }
  const result = await InspectionNative.saveExport({
    name,
    path: file.uri,
    mimeType,
  });
  return result.cancelled ? '已取消保存' : '检测数据已保存到所选位置';
}
export async function exportAndroidExcel(
  records: Inspection[],
  action: 'save' | 'share',
) {
  const workbook = await createWorkbook(records);
  const buffer = await workbook.xlsx.writeBuffer();
  const name = `检图_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.xlsx`;
  return exportAndroidFile(
    new Blob([buffer]),
    name,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    action,
  );
}
