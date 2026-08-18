import { COOKIE_NAME } from "@shared/const";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookieHeader } from "cookie";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { verifySessionToken } from "../auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

async function authenticateRequest(req: CreateExpressContextOptions["req"]): Promise<User | null> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[COOKIE_NAME];
  const session = await verifySessionToken(token);
  if (!session) return null;

  const user = await db.getUserByOpenId(session.openId);
  if (!user || user.id !== session.userId) return null;
  return user;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
