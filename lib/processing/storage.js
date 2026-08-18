import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3, uploadBucket } from '../uploads/s3';

export async function streamToBuffer(body, maxBytes = 64 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > maxBytes) throw new Error(`Object exceeds processing buffer ceiling (${maxBytes} bytes)`);
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function getObjectBuffer(key, { range, maxBytes } = {}) {
  const s3 = getS3();
  const response = await s3.send(new GetObjectCommand({ Bucket: uploadBucket(), Key: key, ...(range ? { Range: range } : {}) }));
  return streamToBuffer(response.Body, maxBytes);
}

export async function getObjectStream(key) {
  const s3 = getS3();
  return s3.send(new GetObjectCommand({ Bucket: uploadBucket(), Key: key }));
}

export async function putDerivedObject(key, body, contentType = 'text/plain; charset=utf-8') {
  const s3 = getS3();
  await s3.send(new PutObjectCommand({
    Bucket: uploadBucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
  }));
  return key;
}

export async function deleteObject(key) {
  const s3 = getS3();
  await s3.send(new DeleteObjectCommand({ Bucket: uploadBucket(), Key: key }));
}
