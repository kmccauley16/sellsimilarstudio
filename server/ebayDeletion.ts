import crypto from "crypto";
import type { Express, Request } from "express";
import { deleteEbayAccountDataBySellerIdentity } from "./db";

export const EBAY_DELETION_PATH = "/api/ebay/marketplace-account-deletion";
const EBAY_TOPIC = "MARKETPLACE_ACCOUNT_DELETION";
const BASE_SCOPE = "https://api.ebay.com/oauth/api_scope";
const EBAY_API_BASE = "https://api.ebay.com";
const PUBLIC_KEY_TTL_MS = 60 * 60 * 1000;

type EbayDeletionNotification = {
  metadata: {
    topic: string;
    schemaVersion?: string;
  };
  notification: {
    notificationId: string;
    data: {
      userId: string;
      username?: string;
    };
  };
};

type SignatureEnvelope = {
  alg: string;
  kid: string;
  signature: string;
  digest: string;
};

type CachedPublicKey = {
  key: string;
  expiresAt: number;
};

const publicKeyCache = new Map<string, CachedPublicKey>();

function requiredEnvironment(name: "EBAY_CLIENT_ID" | "EBAY_CLIENT_SECRET" | "JWT_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function deriveEbayDeletionVerificationToken(secret = requiredEnvironment("JWT_SECRET")) {
  return crypto
    .createHmac("sha256", secret)
    .update("sell-similar-studio:ebay-account-deletion:v1")
    .digest("base64url");
}

function firstForwardedValue(value: string | undefined) {
  return value?.split(",")[0]?.trim();
}

export function getEbayDeletionEndpoint(req: Request) {
  const configured = process.env.EBAY_DELETION_ENDPOINT?.trim();
  if (configured) return configured;

  const protocol = firstForwardedValue(req.get("x-forwarded-proto")) || req.protocol;
  const host = firstForwardedValue(req.get("x-forwarded-host")) || req.get("host");
  if (!host) throw new Error("Unable to determine the public application host");

  return `${protocol}://${host}${EBAY_DELETION_PATH}`;
}

export function generateEbayChallengeResponse(
  challengeCode: string,
  verificationToken: string,
  endpoint: string,
) {
  return crypto
    .createHash("sha256")
    .update(challengeCode)
    .update(verificationToken)
    .update(endpoint)
    .digest("hex");
}

function parseSignatureEnvelope(header: string): SignatureEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    throw new Error("Invalid eBay signature header");
  }

  if (!parsed || typeof parsed !== "object") throw new Error("Invalid eBay signature header");
  const envelope = parsed as Partial<SignatureEnvelope>;
  if (
    typeof envelope.alg !== "string" ||
    typeof envelope.kid !== "string" ||
    typeof envelope.signature !== "string" ||
    typeof envelope.digest !== "string" ||
    envelope.kid.length > 100
  ) {
    throw new Error("Invalid eBay signature header");
  }
  if (envelope.alg.toLowerCase() !== "ecdsa" || envelope.digest.toUpperCase() !== "SHA1") {
    throw new Error("Unsupported eBay signature algorithm");
  }
  return envelope as SignatureEnvelope;
}

async function getApplicationAccessToken() {
  const clientId = requiredEnvironment("EBAY_CLIENT_ID");
  const clientSecret = requiredEnvironment("EBAY_CLIENT_SECRET");
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: BASE_SCOPE });
  const response = await fetch(`${EBAY_API_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`eBay application token request failed (${response.status})`);
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("eBay application token response was incomplete");
  return payload.access_token;
}

async function getNotificationPublicKey(keyId: string) {
  const cached = publicKeyCache.get(keyId);
  if (cached && cached.expiresAt > Date.now()) return cached.key;

  const token = await getApplicationAccessToken();
  const response = await fetch(
    `${EBAY_API_BASE}/commerce/notification/v1/public_key/${encodeURIComponent(keyId)}`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`eBay notification public-key request failed (${response.status})`);
  const payload = (await response.json()) as { key?: string; algorithm?: string; digest?: string };
  if (!payload.key) throw new Error("eBay notification public-key response was incomplete");

  const formatted = payload.key
    .replace(/-----BEGIN PUBLIC KEY-----/, "-----BEGIN PUBLIC KEY-----\n")
    .replace(/-----END PUBLIC KEY-----/, "\n-----END PUBLIC KEY-----");
  publicKeyCache.set(keyId, { key: formatted, expiresAt: Date.now() + PUBLIC_KEY_TTL_MS });
  return formatted;
}

export function verifyEbaySignatureWithKey(
  message: unknown,
  signatureHeader: string,
  publicKey: string,
) {
  const envelope = parseSignatureEnvelope(signatureHeader);
  const verifier = crypto.createVerify("sha1");
  verifier.update(JSON.stringify(message));
  verifier.end();
  return verifier.verify(publicKey, envelope.signature, "base64");
}

async function verifyEbayNotification(message: unknown, signatureHeader: string) {
  const envelope = parseSignatureEnvelope(signatureHeader);
  const publicKey = await getNotificationPublicKey(envelope.kid);
  return verifyEbaySignatureWithKey(message, signatureHeader, publicKey);
}

export function parseDeletionNotification(value: unknown): EbayDeletionNotification {
  if (!value || typeof value !== "object") throw new Error("Invalid notification payload");
  const payload = value as Partial<EbayDeletionNotification>;
  const data = payload.notification?.data;
  if (
    payload.metadata?.topic !== EBAY_TOPIC ||
    typeof payload.notification?.notificationId !== "string" ||
    typeof data?.userId !== "string" ||
    data.userId.length === 0 ||
    data.userId.length > 128 ||
    (data.username !== undefined && (typeof data.username !== "string" || data.username.length > 128))
  ) {
    throw new Error("Invalid notification payload");
  }
  return payload as EbayDeletionNotification;
}

export async function processEbayDeletionNotification(
  value: unknown,
  deleteAccountData = deleteEbayAccountDataBySellerIdentity,
) {
  const payload = parseDeletionNotification(value);
  return deleteAccountData(
    payload.notification.data.userId,
    payload.notification.data.username,
  );
}

export type EbayDeletionRouteDependencies = {
  verifyNotification?: (message: unknown, signatureHeader: string) => Promise<boolean>;
  processNotification?: (value: unknown) => Promise<number>;
};

export function registerEbayDeletionRoutes(app: Express, dependencies: EbayDeletionRouteDependencies = {}) {
  const verifyNotification = dependencies.verifyNotification ?? verifyEbayNotification;
  const processNotification = dependencies.processNotification ?? processEbayDeletionNotification;

  app.get(EBAY_DELETION_PATH, (req, res) => {
    const challengeCode = typeof req.query.challenge_code === "string" ? req.query.challenge_code : "";
    if (!challengeCode || challengeCode.length > 256) {
      res.status(400).json({ error: "challenge_code is required" });
      return;
    }

    try {
      const endpoint = getEbayDeletionEndpoint(req);
      const verificationToken = deriveEbayDeletionVerificationToken();
      const challengeResponse = generateEbayChallengeResponse(
        challengeCode,
        verificationToken,
        endpoint,
      );
      res.status(200).json({ challengeResponse });
    } catch {
      res.status(500).json({ error: "Endpoint validation is not configured" });
    }
  });

  app.post(EBAY_DELETION_PATH, async (req, res) => {
    const signature = req.get("x-ebay-signature");
    if (!signature) {
      res.status(412).end();
      return;
    }

    try {
      const isAuthentic = await verifyNotification(req.body, signature);
      if (!isAuthentic) {
        res.status(412).end();
        return;
      }

      const deletedConnections = await processNotification(req.body);
      console.info("[eBay deletion] Verified request processed", {
        matchedConnections: deletedConnections,
      });
      res.status(204).end();
    } catch (error) {
      console.error("[eBay deletion] Notification processing failed", {
        reason: error instanceof Error ? error.message : "Unknown error",
      });
      res.status(500).end();
    }
  });
}
