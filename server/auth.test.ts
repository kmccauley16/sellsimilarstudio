import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from "./auth";

const mocks = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  touchLastSignedIn: vi.fn(),
}));

vi.mock("./db", () => ({
  getUserByEmail: mocks.getUserByEmail,
  createUser: mocks.createUser,
  touchLastSignedIn: mocks.touchLastSignedIn,
}));

process.env.JWT_SECRET = "test-session-secret-value-not-real";

import { appRouter } from "./routers";

type CookieCall = { name: string; value: string; options: Record<string, unknown> };

function createUnauthedContext() {
  const setCookies: CookieCall[] = [];
  const clearedCookies: CookieCall[] = [];
  const ctx = {
    user: null,
    req: { protocol: "https", headers: {} } as never,
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, value: "", options });
      },
    } as never,
  };
  return { ctx, setCookies, clearedCookies };
}

describe("password hashing and session tokens", () => {
  it("hashes and verifies a password without storing it in plain text", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("round-trips a session token and rejects a tampered one", async () => {
    const token = await createSessionToken({ userId: 42, openId: "local_abc" });
    await expect(verifySessionToken(token)).resolves.toEqual({ userId: 42, openId: "local_abc" });
    await expect(verifySessionToken(`${token}tampered`)).resolves.toBeNull();
    await expect(verifySessionToken(undefined)).resolves.toBeNull();
  });
});

describe("auth.register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an account and starts a session when the email is not already taken", async () => {
    mocks.getUserByEmail.mockResolvedValue(undefined);
    const createdUser = { id: 1, openId: "local_new", email: "new@example.com", role: "user" as const };
    mocks.createUser.mockResolvedValue(createdUser);

    const { ctx, setCookies } = createUnauthedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.register({ email: "New@Example.com", password: "a-strong-password" });

    expect(result).toEqual(createdUser);
    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@example.com" }),
    );
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]?.name).toBe("app_session_id");
  });

  it("rejects registration when the email is already in use", async () => {
    mocks.getUserByEmail.mockResolvedValue({ id: 1, email: "taken@example.com" });
    const { ctx } = createUnauthedContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.register({ email: "taken@example.com", password: "a-strong-password" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 8 characters", async () => {
    const { ctx } = createUnauthedContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.auth.register({ email: "short@example.com", password: "short" })).rejects.toThrow();
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});

describe("auth.me", () => {
  it("never exposes the password hash to the client", async () => {
    const ctx = {
      user: {
        id: 3,
        openId: "local_three",
        email: "three@example.com",
        passwordHash: "super-secret-hash",
        name: null,
        loginMethod: "password",
        role: "user" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as never,
      res: {} as never,
    };
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).not.toHaveProperty("passwordHash");
    expect(result).toMatchObject({ id: 3, email: "three@example.com" });
  });
});

describe("auth.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts a session for the correct password", async () => {
    const passwordHash = await hashPassword("correct-password");
    mocks.getUserByEmail.mockResolvedValue({ id: 7, openId: "local_seven", email: "seven@example.com", passwordHash });

    const { ctx, setCookies } = createUnauthedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.login({ email: "seven@example.com", password: "correct-password" });

    expect(result).toMatchObject({ id: 7 });
    expect(result).not.toHaveProperty("passwordHash");
    expect(mocks.touchLastSignedIn).toHaveBeenCalledWith(7);
    expect(setCookies).toHaveLength(1);
  });

  it("rejects an incorrect password without revealing whether the account exists", async () => {
    const passwordHash = await hashPassword("correct-password");
    mocks.getUserByEmail.mockResolvedValue({ id: 7, openId: "local_seven", email: "seven@example.com", passwordHash });
    const { ctx: wrongPasswordCtx } = createUnauthedContext();
    const wrongPasswordCaller = appRouter.createCaller(wrongPasswordCtx);
    const wrongPasswordError = await wrongPasswordCaller.auth
      .login({ email: "seven@example.com", password: "wrong-password" })
      .catch(error => error);

    mocks.getUserByEmail.mockResolvedValue(undefined);
    const { ctx: noAccountCtx } = createUnauthedContext();
    const noAccountCaller = appRouter.createCaller(noAccountCtx);
    const noAccountError = await noAccountCaller.auth
      .login({ email: "nobody@example.com", password: "wrong-password" })
      .catch(error => error);

    expect(wrongPasswordError).toMatchObject({ code: "UNAUTHORIZED" });
    expect(noAccountError).toMatchObject({ code: "UNAUTHORIZED" });
    expect(wrongPasswordError.message).toBe(noAccountError.message);
  });
});
