// Photo storage for seller-uploaded images, backed directly by an S3-compatible bucket.
// Uploads go straight to S3; downloads are served through the /storage/{key} route,
// which redirects to a freshly generated short-lived signed URL (the bucket itself
// stays private).

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const SIGNED_URL_TTL_SECONDS = 5 * 60;

let _client: S3Client | null = null;

function getBucket() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("Storage config missing: set S3_BUCKET.");
  return bucket;
}

function getClient() {
  if (_client) return _client;
  const region = process.env.S3_REGION;
  if (!region) throw new Error("Storage config missing: set S3_REGION.");
  _client = new S3Client({
    region,
    // Optional: point at an S3-compatible provider (Cloudflare R2, MinIO, etc.) instead of AWS.
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  });
  return _client;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: data,
      ContentType: contentType,
    }),
  );

  return { key, url: `/storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}
