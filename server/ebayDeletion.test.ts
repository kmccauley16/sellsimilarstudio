import express, { type Express } from "express";
import { createSign, generateKeyPairSync } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  deriveEbayDeletionVerificationToken,
  EBAY_DELETION_PATH,
  generateEbayChallengeResponse,
  parseDeletionNotification,
  processEbayDeletionNotification,
  registerEbayDeletionRoutes,
  verifyEbaySignatureWithKey,
} from "./ebayDeletion";

const officialMessage = {
  metadata: {
    topic: "MARKETPLACE_ACCOUNT_DELETION",
    schemaVersion: "1.0",
    deprecated: false,
  },
  notification: {
    notificationId: "49feeaeb-4982-42d9-a377-9645b8479411_33f7e043-fed8-442b-9d44-791923bd9a6d",
    eventDate: "2021-03-19T20:43:59.462Z",
    publishDate: "2021-03-19T20:43:59.679Z",
    publishAttemptCount: 1,
    data: {
      username: "test_user",
      userId: "ma8vp1jySJC",
      eiasToken: "nY+sHZ2PrBmdj6wVnY+sEZ2PrBmdj6wJnY+gAZGEpwmdj6x9nY+seQ==",
    },
  },
};

function createSignedNotification(message: unknown, keyId: string) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const signer = createSign("sha1");
  signer.update(JSON.stringify(message));
  signer.end();
  const signature = Buffer.from(JSON.stringify({
    alg: "ecdsa",
    kid: keyId,
    signature: signer.sign(privateKey).toString("base64"),
    digest: "SHA1",
  })).toString("base64");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return {
    signature,
    publicKeyPem,
    compactPublicKey: publicKeyPem.replace(/\n/g, ""),
  };
}

async function postSignedDeletionNotification(app: Express, payload: unknown, signature: string) {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Deletion test server did not expose a TCP port");
    }
    const body = JSON.stringify(payload);

    return await new Promise<number>((resolve, reject) => {
      const request = httpRequest({
        hostname: "127.0.0.1",
        port: address.port,
        path: EBAY_DELETION_PATH,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-ebay-signature": signature,
        },
      }, response => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      });
      request.on("error", reject);
      request.end(body);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

describe("eBay marketplace account deletion compliance", () => {
  it("derives a stable verification token without exposing JWT_SECRET", () => {
    const first = deriveEbayDeletionVerificationToken("test-secret");
    const second = deriveEbayDeletionVerificationToken("test-secret");
    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toContain("test-secret");
  });

  it("generates the exact SHA-256 endpoint challenge response", () => {
    expect(
      generateEbayChallengeResponse(
        "71745723-d031-455c-bfa5-f90d11b4f20a",
        "71745723-d031-455c-bfa5-f90d11b4f20a",
        "https://example.com/api/ebay/marketplace-account-deletion",
      ),
    ).toBe("b2aba4192b42f97cf5bb178e6064d5dad7eed89e42bf91937256734f0c61efa5");
  });

  it("verifies a valid ECDSA/SHA1 notification signature and rejects a tampered payload", () => {
    const signed = createSignedNotification(officialMessage, "signature-unit-test-key");
    expect(verifyEbaySignatureWithKey(officialMessage, signed.signature, signed.publicKeyPem)).toBe(true);
    expect(
      verifyEbaySignatureWithKey(
        { ...officialMessage, metadata: { ...officialMessage.metadata, schemaVersion: "tampered" } },
        signed.signature,
        signed.publicKeyPem,
      ),
    ).toBe(false);
  });

  it("validates the deletion topic and immutable seller identifier", () => {
    expect(parseDeletionNotification(officialMessage).notification.data.userId).toBe("ma8vp1jySJC");
    expect(() =>
      parseDeletionNotification({ ...officialMessage, metadata: { topic: "OTHER_TOPIC" } }),
    ).toThrow("Invalid notification payload");
  });

  it("passes only the verified seller identifiers to the cleanup boundary", async () => {
    const cleanup = vi.fn().mockResolvedValue(1);
    await expect(processEbayDeletionNotification(officialMessage, cleanup)).resolves.toBe(1);
    expect(cleanup).toHaveBeenCalledWith("ma8vp1jySJC", "test_user");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("processes a signed deletion POST with configured eBay credentials and a non-destructive cleanup boundary", async () => {
    const originalEnv = { ...process.env };
    process.env.EBAY_CLIENT_ID = "configured-client-id";
    process.env.EBAY_CLIENT_SECRET = "configured-client-secret";
    process.env.JWT_SECRET = "configured-jwt-secret";

    const signed = createSignedNotification(officialMessage, "test-signed-deletion-key");
    const cleanup = vi.fn().mockResolvedValue(1);
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async input => {
      const url = String(input);
      if (url.endsWith("/identity/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "application-token" }), { status: 200 });
      }
      if (url.endsWith("/commerce/notification/v1/public_key/test-signed-deletion-key")) {
        return new Response(JSON.stringify({ key: signed.compactPublicKey }), { status: 200 });
      }
      throw new Error(`Unexpected eBay request in deletion test: ${url}`);
    });

    const app = express();
    app.use(express.json());
    registerEbayDeletionRoutes(app, { processNotification: cleanup });

    try {
      await expect(postSignedDeletionNotification(app, officialMessage, signed.signature)).resolves.toBe(204);
      expect(cleanup).toHaveBeenCalledWith(officialMessage);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from("configured-client-id:configured-client-secret").toString("base64")}`,
        },
      });
    } finally {
      fetchSpy.mockRestore();
      process.env = originalEnv;
    }
  });
});
