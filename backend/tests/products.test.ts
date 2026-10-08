// tests/products.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

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
    PORT: 4002,
  },
}));

const mockProducts = [
  {
    id: 1,
    name: "Капучино",
    description: "Смачна кава",
    weight: "250ml",
    price: "75.00",
    image: null,
    category: "Кава",
    hidden: false,
    createdAt: new Date("2024-01-01"),
  },
  {
    id: 2,
    name: "Латте",
    description: null,
    weight: "300ml",
    price: "85.00",
    image: null,
    category: "Кава",
    hidden: false,
    createdAt: new Date("2024-01-02"),
  },
];

vi.mock("../src/db/index.js", () => {
  let callCount = 0;
  return {
    db: {
      select: vi.fn().mockReturnThis(),
      selectDistinct: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve([]);
      }),
      orderBy: vi.fn().mockResolvedValue(mockProducts),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([mockProducts[0]]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    },
  };
});

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

  const { productsRoutes } = await import("../src/routes/products.js");
  await app.register(productsRoutes, { prefix: "/api/products" });

  await app.ready();
  return app;
}

describe("Products routes", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/products", () => {
    it("returns product list", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/products",
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as unknown[];
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("GET /api/products/:id", () => {
    it("returns 400 for non-numeric id", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/products/abc",
      });
      expect(response.statusCode).toBe(400);
    });

    it("returns 404 for missing product", async () => {
      const { db } = await import("../src/db/index.js");
      (
        db as { limit: ReturnType<typeof vi.fn> } & typeof db
      ).limit.mockResolvedValueOnce([]);

      const response = await app.inject({
        method: "GET",
        url: "/api/products/999",
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /api/products (admin required)", () => {
    it("returns 401 without token", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/products",
        payload: {
          name: "Новий товар",
          price: "100.00",
          category: "Кава",
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
      const token = app.jwt.sign({
        id: 1,
        email: "user@test.com",
        admin: false,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/products",
        headers: { Authorization: `Bearer ${token}` },
        payload: {
          name: "Новий товар",
          price: "100.00",
          category: "Кава",
        },
      });
      expect(response.statusCode).toBe(403);
    });

    it("returns 400 for invalid price format", async () => {
      const token = app.jwt.sign({
        id: 1,
        email: "admin@test.com",
        admin: true,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/products",
        headers: { Authorization: `Bearer ${token}` },
        payload: {
          name: "Новий товар",
          price: "not-a-price",
          category: "Кава",
        },
      });
      expect(response.statusCode).toBe(400);
    });

    it("accepts numeric price and empty optional fields from the admin form", async () => {
      const { db } = await import("../src/db/index.js");
      const values = (db as unknown as { values: ReturnType<typeof vi.fn> })
        .values;
      values.mockClear();

      const token = app.jwt.sign({
        id: 1,
        email: "admin@test.com",
        admin: true,
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/products",
        headers: { Authorization: `Bearer ${token}` },
        payload: {
          name: "Новий товар",
          price: 99.5,
          category: "Кава",
          image: "",
          description: "",
          weight: "",
        },
      });
      expect(response.statusCode).toBe(201);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ price: "99.50", image: null }),
      );
    });
  });

  describe("GET /api/products visibility", () => {
    it("filters hidden products for anonymous users", async () => {
      const { db } = await import("../src/db/index.js");
      const where = (db as unknown as { where: ReturnType<typeof vi.fn> })
        .where;
      where.mockClear();

      await app.inject({ method: "GET", url: "/api/products" });
      expect(where.mock.calls[0]?.[0]).toBeDefined();
    });

    it("returns hidden products to admins", async () => {
      const { db } = await import("../src/db/index.js");
      const where = (db as unknown as { where: ReturnType<typeof vi.fn> })
        .where;
      where.mockClear();

      const token = app.jwt.sign({
        id: 1,
        email: "admin@test.com",
        admin: true,
      });
      const response = await app.inject({
        method: "GET",
        url: "/api/products",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(where.mock.calls[0]?.[0]).toBeUndefined();
    });
  });

  describe("DELETE /api/products/:id (admin required)", () => {
    it("returns 401 without token", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/products/1",
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
