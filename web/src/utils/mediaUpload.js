export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

export const SUPPORTED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
];

export const SUPPORTED_MEDIA_MIME_TYPES = [
  ...SUPPORTED_IMAGE_MIME_TYPES,
  ...SUPPORTED_VIDEO_MIME_TYPES,
];

export const IMAGE_INPUT_ACCEPT = SUPPORTED_IMAGE_MIME_TYPES.join(',');
export const MEDIA_INPUT_ACCEPT = SUPPORTED_MEDIA_MIME_TYPES.join(',');

export const UNSUPPORTED_MEDIA_MESSAGE = 'Unsupported file type. Use JPG, PNG, GIF, WebP, MP4, or WebM.';
export const UNSUPPORTED_IMAGE_MESSAGE = 'Unsupported image type. Use JPG, PNG, GIF, or WebP.';

export const isSupportedImageFile = (file) => Boolean(file?.type) && SUPPORTED_IMAGE_MIME_TYPES.includes(file.type);

export const isSupportedMediaFile = (file) => Boolean(file?.type) && SUPPORTED_MEDIA_MIME_TYPES.includes(file.type);

export const normalizeImageList = (images = []) => {
  const normalized = images
    .map((image) => (typeof image === 'string' ? image.trim() : ''))
    .filter(Boolean);

  return normalized.length > 0 ? normalized : [''];
};
