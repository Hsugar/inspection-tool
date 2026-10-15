const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

export const PHOTO_ACCEPT = PHOTO_TYPES.join(',');

export function validatePhotoFile(
  file: Pick<File, 'type' | 'size'>,
): 'type' | 'size' | 'empty' | null {
  if (!PHOTO_TYPES.some((type) => type === file.type)) return 'type';
  if (file.size === 0) return 'empty';
  if (file.size > MAX_PHOTO_BYTES) return 'size';
  return null;
}
