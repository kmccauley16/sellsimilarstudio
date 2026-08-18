import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({}),
  getSignedUrl: vi.fn().mockResolvedValue("https://bucket.s3.example.com/signed?token=abc"),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mocks.send })),
  PutObjectCommand: vi.fn().mockImplementation(input => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation(input => ({ input })),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));

describe("storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.S3_BUCKET = "test-bucket";
    process.env.S3_REGION = "us-east-1";
  });

  it("uploads to the configured bucket and returns a /storage/ url with a de-duped key", async () => {
    const { storagePut } = await import("./storage");
    const { key, url } = await storagePut("owned/user-1/photo.jpg", Buffer.from("data"), "image/jpeg");

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(key).toMatch(/^owned\/user-1\/photo_[a-f0-9]{8}\.jpg$/);
    expect(url).toBe(`/storage/${key}`);
  });

  it("produces a short-lived signed URL for downloads", async () => {
    const { storageGetSignedUrl } = await import("./storage");
    const url = await storageGetSignedUrl("/owned/user-1/photo_abc123.jpg");

    expect(url).toBe("https://bucket.s3.example.com/signed?token=abc");
    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ input: expect.objectContaining({ Bucket: "test-bucket", Key: "owned/user-1/photo_abc123.jpg" }) }),
      { expiresIn: 300 },
    );
  });

  it("fails clearly when the bucket is not configured", async () => {
    delete process.env.S3_BUCKET;
    const { storagePut } = await import("./storage");
    await expect(storagePut("owned/x.jpg", Buffer.from("x"))).rejects.toThrow(/S3_BUCKET/);
  });
});
