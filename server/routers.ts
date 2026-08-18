import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import type { TrpcContext } from "./_core/context";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { createSessionToken, generateOpenId, hashPassword, verifyPassword } from "./auth";
import * as db from "./db";
import { ebayRouter } from "./ebayRouter";
import { listingRouter } from "./listingRouter";

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(200);

const INVALID_CREDENTIALS_MESSAGE = "Incorrect email or password.";

async function startSession(ctx: Pick<TrpcContext, "req" | "res">, user: { id: number; openId: string }) {
  const token = await createSessionToken({ userId: user.id, openId: user.openId }, ONE_YEAR_MS);
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}

// Never send the password hash to the client, even though it lives on the same row.
function toPublicUser<T extends { passwordHash?: unknown }>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => (opts.ctx.user ? toPublicUser(opts.ctx.user) : null)),

    register: publicProcedure
      .input(z.object({ email: emailSchema, password: passwordSchema, name: z.string().trim().max(200).optional() }))
      .mutation(async ({ ctx, input }) => {
        const existing = await db.getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with that email already exists." });
        }
        const passwordHash = await hashPassword(input.password);
        const user = await db.createUser({
          openId: generateOpenId(),
          email: input.email,
          passwordHash,
          name: input.name ?? null,
        });
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create the account." });
        }
        await startSession(ctx, user);
        return toPublicUser(user);
      }),

    login: publicProcedure
      .input(z.object({ email: emailSchema, password: z.string().min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserByEmail(input.email);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_CREDENTIALS_MESSAGE });
        }
        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: INVALID_CREDENTIALS_MESSAGE });
        }
        await db.touchLastSignedIn(user.id);
        await startSession(ctx, user);
        return toPublicUser(user);
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  listing: listingRouter,
  ebay: ebayRouter,
});

export type AppRouter = typeof appRouter;
