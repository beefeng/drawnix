export type ChatImage = {
  id: string;
  dataUrl: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  size: number;
};

const MAX_IMAGE_DIMENSION = 1600;
const MAX_IMAGE_INPUT_BYTES = 20 * 1024 * 1024;
const COMPRESS_THRESHOLD_BYTES = 700 * 1024;
const COMPRESS_QUALITY = 0.9;

const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const createImageId = () => {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
};

const readBlobAsDataUrl = (blob: Blob) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
};

const loadImage = (dataUrl: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解析失败'));
    image.src = dataUrl;
  });
};

const getDataUrlByteLength = (dataUrl: string) => {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    return dataUrl.length;
  }
  return Math.ceil(((dataUrl.length - commaIndex - 1) * 3) / 4);
};

const canvasToDataUrl = (canvas: HTMLCanvasElement) => {
  return new Promise<string>((resolve) => {
    if (!canvas.toBlob) {
      resolve(canvas.toDataURL('image/webp', COMPRESS_QUALITY));
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(canvas.toDataURL('image/webp', COMPRESS_QUALITY));
          return;
        }
        readBlobAsDataUrl(blob).then(resolve, () =>
          resolve(canvas.toDataURL('image/webp', COMPRESS_QUALITY))
        );
      },
      'image/webp',
      COMPRESS_QUALITY
    );
  });
};

const compressImage = async (image: HTMLImageElement) => {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0, outputWidth, outputHeight);
  const dataUrl = await canvasToDataUrl(canvas);
  if (!dataUrl.startsWith('data:image/')) {
    return null;
  }
  return {
    dataUrl,
    width: outputWidth,
    height: outputHeight,
    mimeType: dataUrl.slice(5, dataUrl.indexOf(';')),
  };
};

export const isSupportedChatImageFile = (file: File) => {
  if (SUPPORTED_IMAGE_TYPES.has(file.type)) {
    return true;
  }
  if (file.type) {
    return false;
  }
  return /\.(png|jpe?g|webp|gif)$/i.test(file.name);
};

export const readChatImage = async (file: File): Promise<ChatImage> => {
  if (!isSupportedChatImageFile(file)) {
    throw new Error('只支持 PNG、JPEG、WebP 或 GIF 图片。');
  }
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new Error('图片不能超过 20MB。');
  }

  const originalDataUrl = await readBlobAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const shouldCompress =
    file.type !== 'image/gif' &&
    (file.size > COMPRESS_THRESHOLD_BYTES || Math.max(width, height) > MAX_IMAGE_DIMENSION);

  if (shouldCompress) {
    const compressed = await compressImage(image);
    if (compressed && compressed.dataUrl.length < originalDataUrl.length) {
      return {
        id: createImageId(),
        dataUrl: compressed.dataUrl,
        name: file.name || '粘贴的图片',
        mimeType: compressed.mimeType,
        width: compressed.width,
        height: compressed.height,
        size: getDataUrlByteLength(compressed.dataUrl),
      };
    }
  }

  return {
    id: createImageId(),
    dataUrl: originalDataUrl,
    name: file.name || '粘贴的图片',
    mimeType: file.type || 'image/png',
    width,
    height,
    size: getDataUrlByteLength(originalDataUrl),
  };
};
