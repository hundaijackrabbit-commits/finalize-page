import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getS3, uploadBucket } from '../uploads/s3';

export async function deleteArtifactObjects(artifact) {
  const s3 = getS3();
  const bucket = uploadBucket();
  const prefix = `${artifact.organization_id}/${artifact.finalization_id}/${artifact.id}/`;
  let token;
  let deleted = 0;
  do {
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    const objects = (listed.Contents || []).map((item) => ({ Key: item.Key }));
    if (objects.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
      deleted += objects.length;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  return { prefix, deleted };
}
