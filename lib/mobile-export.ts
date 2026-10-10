import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { InspectionNative, blobToBase64 } from './native';
import { createWorkbook } from './export';
import type { Inspection } from './inspection';
export async function exportAndroidExcel(
  records: Inspection[],
  action: 'save' | 'share',
) {
  const workbook = await createWorkbook(records);
  const buffer = await workbook.xlsx.writeBuffer();
  const name = `检图_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.xlsx`;
  // Android's chooser receives a content URI for the cached workbook.
  const file = await Filesystem.writeFile({
    path: `exports/${name}`,
    directory: Directory.Cache,
    data: await blobToBase64(new Blob([buffer])),
    recursive: true,
  });
  // Keep recent exports available to receiving apps; age out old cache files.
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
  if (action === 'share') {
    await Share.share({
      title: '检图检测记录',
      files: [file.uri],
      dialogTitle: '分享 Excel',
    });
    return '已打开系统分享面板';
  }
  const result = await InspectionNative.saveExcel({ name, path: file.uri });
  return result.cancelled ? '已取消保存' : 'Excel 已保存到所选位置';
}
