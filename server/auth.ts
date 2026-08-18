import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE_ALG = "HS256";
const BCRYPT_ROUNDS = 12;

function requireSessionSecret() {
  // Read live rather than via a module-load-time snapshot, so setting the env
  // var after this module first loads (e.g. in tests) still takes effect.
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured; cannot sign or verify sessions.");
  }
  return new TextEncoder().encode(secret);
}

export function generateOpenId() {
  return `local_${nanoid()}`;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export type SessionPayload = {
  userId: number;
  openId: string;
};

export async function createSessionToken(payload: SessionPayload, expiresInMs = 1000 * 60 * 60 * 24 * 365) {
  const expirationSeconds = Math.floor((Date.now() + expiresInMs) / 1000);
  return new SignJWT({ userId: payload.userId, openId: payload.openId })
    .setProtectedHeader({ alg: SESSION_COOKIE_ALG, typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(requireSessionSecret());
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, requireSessionSecret(), { algorithms: [SESSION_COOKIE_ALG] });
    const { userId, openId } = payload as Record<string, unknown>;
    if (typeof userId !== "number" || typeof openId !== "string") return null;
    return { userId, openId };
  } catch {
    return null;
  }
}
