import { S3Client } from '@aws-sdk/client-s3';

let s3;
export function getS3() {
  if (!s3) s3 = new S3Client({ region: process.env.AWS_REGION });
  return s3;
}

export const uploadBucket = () => process.env.FINALIZE_UPLOAD_BUCKET;
