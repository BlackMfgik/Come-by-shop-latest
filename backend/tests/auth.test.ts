// tests/auth.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Mock env before importing app modules
vi.mock("../src/env.js", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-key-that-is-at-least-32-chars-long",
    ALLOWED_ORIGIN: "http://localhost:3000",
    TURBOSMS_TOKEN: "test-token",
    TURBOSMS_SENDER: "TestSender",
    WAYFORPAY_MERCHANT_ACCOUNT: "test_merchant",
    WAYFORPAY_SECRET_KEY: "test_secret",
    WAYFORPAY_DOMAIN: "test.com",
    EMAIL_PROVIDER_API_KEY: "test_email_key",
    EMAIL_FROM_ADDRESS: "test@test.com",
    GOOGLE_CLIENT_ID: "test_google_client_id",
    PORT: 4001,
  },
}));

// Mock DB
vi.mock("../src/db/index.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    transaction: vi.fn(),
  },
}));

// Mock external services
vi.mock("../src/services/sms.js", () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
  generateOtp: vi.fn().mockReturnValue("123456"),
  timingSafeCompare: vi.fn((a: string, b: string) => a === b),
}));

vi.mock("../src/services/email.js", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendEmailChangeCode: vi.fn().mockResolvedValue(undefined),
  sendTwoFactorEmail: vi.fn().mockResolvedValue(undefined),
  sendEmailVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn().mockResolvedValue({
      getPayload: () => ({
        email: "google@example.com",
        name: "Google User",
      }),
    }),
  })),
}));

import Fastify from "fastify";
import jwt from "@fastify/jwt";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

async function buildTestApp() {
  const app = Fastify({ logger: false });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: "http://localhost:3000",
    credentials: true,
  });
  await app.register(rateLimit, { global: false });
  await app.register(jwt, {
    secret: "test-secret-key-that-is-at-least-32-chars-long",
  });

  const { authRoutes } = await import("../src/routes/auth.js");
  await app.register(authRoutes, { prefix: "/api/auth" });

  await app.ready();
  return app;
}

describe("Auth routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/auth/register", () => {
    it("returns 400 for missing fields", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: "not-an-email" },
      });
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body) as { error: string };
      expect(body).toHaveProperty("error");
    });

    it("returns 400 for short password", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: "test@test.com", password: "123", name: "Test" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("returns 409 for duplicate email", async () => {
      const { db } = await import("../src/db/index.js");
      (
        db as { limit: ReturnType<typeof vi.fn> } & typeof db
      ).limit.mockResolvedValueOnce([{ id: 1 }]);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "existing@test.com",
          password: "password123",
          name: "Test User",
        },
      });
      expect(response.statusCode).toBe(409);
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns 400 for missing deviceId", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "test@test.com", password: "password123" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("returns 401 for non-existent user", async () => {
      const { db } = await import("../src/db/index.js");
      (
        db as { limit: ReturnType<typeof vi.fn> } & typeof db
      ).limit.mockResolvedValueOnce([]);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "nobody@test.com",
          password: "password123",
          deviceId: "device-abc",
        },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns 401 without token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns user with valid token", async () => {
      const { db } = await import("../src/db/index.js");
      const mockUser = {
        id: 1,
        email: "test@test.com",
        passwordHash: "hashed",
        name: "Test",
        phone: null,
        phoneVerified: false,
        address: null,
        cardMaskedPan: null,
        cardType: null,
        admin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (
        db as { limit: ReturnType<typeof vi.fn> } & typeof db
      ).limit.mockResolvedValueOnce([mockUser]);

      const token = app.jwt.sign({
        id: 1,
        email: "test@test.com",
        admin: false,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { email: string };
      expect(body.email).toBe("test@test.com");
      expect(body).not.toHaveProperty("passwordHash");
    });
  });

  describe("POST /api/auth/reset-password", () => {
    it("always returns ok (no email enumeration)", async () => {
      const { db } = await import("../src/db/index.js");
      (
        db as { limit: ReturnType<typeof vi.fn> } & typeof db
      ).limit.mockResolvedValueOnce([]);

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { email: "nobody@test.com" },
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { ok: boolean };
      expect(body.ok).toBe(true);
    });
  });

  describe("POST /api/auth/google", () => {
    it("returns 400 for missing idToken", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/google",
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });
  });
});
