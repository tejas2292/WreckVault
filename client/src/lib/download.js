// Trigger a file download in the browser.

// Local calendar date as YYYY-MM-DD.
export function dateStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export const downloadJson = (filename, data) =>
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));

export const downloadText = (filename, text, mime = 'text/plain') =>
  downloadBlob(filename, new Blob([text], { type: mime }));
