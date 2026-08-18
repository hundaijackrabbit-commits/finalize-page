'use client';

const api = async (payload) => {
  const response = await fetch('/api/uploads/multipart', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || data.error || 'Upload request failed');
  return data;
};

async function checksumBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function putPart(url, blob, checksum, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('x-amz-checksum-sha256', checksum);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(event.loaded); };
    xhr.onerror = () => reject(new Error('Network error while uploading a file part'));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(`Part upload failed (${xhr.status})`));
      const etag = xhr.getResponseHeader('ETag');
      if (!etag) return reject(new Error('Storage did not expose the ETag header. Check S3 CORS configuration.'));
      resolve(etag);
    };
    xhr.send(blob);
  });
}

async function withRetry(fn, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (error) { last = error; if (i < attempts - 1) await new Promise((r) => setTimeout(r, 700 * (i + 1))); }
  }
  throw last;
}

export async function uploadArtifact({ finalizationId, file, privacy = 'BUSINESS', onProgress = () => {}, signal }) {
  const started = await api({ action: 'start', finalizationId, filename: file.name, size: file.size, contentType: file.type, privacy });
  const { artifactId, partSize } = started;
  const totalParts = Math.ceil(file.size / partSize);
  const parts = new Array(totalParts);
  const loaded = new Map();
  let cursor = 0;
  const report = () => onProgress(Math.min(100, Math.round(([...loaded.values()].reduce((a,b) => a+b, 0) / file.size) * 100)));

  async function worker() {
    while (true) {
      if (signal?.aborted) throw new DOMException('Upload aborted', 'AbortError');
      const index = cursor++;
      if (index >= totalParts) return;
      const partNumber = index + 1;
      const start = index * partSize;
      const blob = file.slice(start, Math.min(file.size, start + partSize));
      const checksum = await checksumBase64(blob);
      const signed = await api({ action: 'sign_part', artifactId, partNumber, checksum });
      const etag = await withRetry(() => putPart(signed.url, blob, checksum, (bytes) => { loaded.set(partNumber, bytes); report(); }));
      loaded.set(partNumber, blob.size); report();
      parts[index] = { partNumber, etag, checksum };
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(3, totalParts) }, () => worker()));
    const completed = await api({ action: 'complete', artifactId, parts });
    onProgress(100);
    return completed;
  } catch (error) {
    await api({ action: 'abort', artifactId }).catch(() => {});
    throw error;
  }
}
