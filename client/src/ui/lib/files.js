import { downloadBlob } from '../../lib/download.js';

export function base64ToBytes(b64) {
  const bin = atob(b64 || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function downloadAttachment(att) {
  const blob = new Blob([base64ToBytes(att.data)], { type: att.mime || 'application/octet-stream' });
  return downloadBlob(att.name || 'attachment', blob);
}

// File -> {name, mime, size, data(base64)}
export function readAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}. Try again.`));
    reader.onload = () => {
      const s = String(reader.result || '');
      const comma = s.indexOf(',');
      resolve({ name: file.name, mime: file.type || 'application/octet-stream', size: file.size, data: comma >= 0 ? s.slice(comma + 1) : '' });
    };
    reader.readAsDataURL(file);
  });
}

// Shrinks an image to a square data URL (for the profile picture) so it stays small.
export function imageToDataUrl(file, size = 160) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not an image this browser can read. Pick a PNG or JPEG.'));
    };
    img.src = url;
  });
}
