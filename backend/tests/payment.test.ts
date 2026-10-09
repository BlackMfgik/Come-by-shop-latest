// tests/payment.test.ts
import crypto from "node:crypto";
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
    PORT: 4003,
  },
}));

vi.mock("../src/db/index.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  },
}));

import Fastify from "fastify";
import jwt from "@fastify/jwt";

function sign(fields: string[]): string {
  return crypto
    .createHmac("md5", "test_secret")
    .update(fields.join(";"))
    .digest("hex");
}

function approvedCallback(amount: number) {
  const body = {
    merchantAccount: "test_merchant",
    orderReference: "ORDER-5",
    amount,
    currency: "UAH",
    authCode: "123",
    cardPan: "41****1111",
    transactionStatus: "Approved",
    reasonCode: 1100,
  };
  return {
    ...body,
    merchantSignature: sign([
      body.merchantAccount,
      body.orderReference,
      String(body.amount),
      body.currency,
      body.authCode,
      body.cardPan,
      body.transactionStatus,
      String(body.reasonCode),
    ]),
  };
}

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(jwt, {
    secret: "test-secret-key-that-is-at-least-32-chars-long",
  });
  const { paymentRoutes } = await import("../src/routes/payment.js");
  await app.register(paymentRoutes, { prefix: "/api/payment" });
  await app.ready();
  return app;
}

describe("WayForPay callback", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 400 (not 500) for a signature of the wrong length", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/payment/wayforpay/callback",
      payload: { ...approvedCallback(150), merchantSignature: "short" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("accepts JSON sent as application/x-www-form-urlencoded", async () => {
    const { db } = await import("../src/db/index.js");
    (db as unknown as { limit: ReturnType<typeof vi.fn> }).limit
      .mockResolvedValueOnce([{ userId: 1, total: "150.00" }]);

    const response = await app.inject({
      method: "POST",
      url: "/api/payment/wayforpay/callback",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: JSON.stringify(approvedCallback(150)),
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      orderReference: "ORDER-5",
      status: "accept",
    });
  });

  it("rejects a callback whose amount does not match the order", async () => {
    const { db } = await import("../src/db/index.js");
    (db as unknown as { limit: ReturnType<typeof vi.fn> }).limit
      .mockResolvedValueOnce([{ userId: 1, total: "999.00" }]);

    const response = await app.inject({
      method: "POST",
      url: "/api/payment/wayforpay/callback",
      payload: approvedCallback(1),
    });
    expect(response.statusCode).toBe(400);
  });

  it("init without orderId returns a signed WayForPay Card Verify form", async () => {
    const { db } = await import("../src/db/index.js");
    (db as unknown as { limit: ReturnType<typeof vi.fn> }).limit
      .mockResolvedValueOnce([{ email: "u@test.com", phone: "+380501112233" }]);

    const token = app.jwt.sign({ id: 42, email: "u@test.com", admin: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/payment/wayforpay/init",
      headers: { Authorization: `Bearer ${token}`, host: "api.example.com" },
      payload: {},
    });
    expect(response.statusCode).toBe(200);

    const { verify } = JSON.parse(response.body) as {
      verify: { url: string; fields: Record<string, string | number> };
    };
    expect(verify.url).toBe("https://secure.wayforpay.com/verify");
    const f = verify.fields;
    expect(f.orderReference).toMatch(/^VERIFY-42-\d+$/);
    expect(f.paymentSystem).toBe("lookupCard");
    expect(f.serviceUrl).toBe(
      "http://api.example.com/api/payment/wayforpay/callback",
    );
    expect(f.merchantSignature).toBe(
      sign([
        "test_merchant",
        "test.com",
        String(f.orderReference),
        "0",
        "UAH",
      ]),
    );
  });

  it("Card Verify callback stores only the masked card for that user", async () => {
    const { db } = await import("../src/db/index.js");
    const set = (db as unknown as { set: ReturnType<typeof vi.fn> }).set;
    set.mockClear();

    const body = {
      merchantAccount: "test_merchant",
      orderReference: "VERIFY-42-1700000000000",
      amount: 0,
      currency: "UAH",
      authCode: "",
      cardPan: "53****5353",
      cardType: "MasterCard",
      transactionStatus: "Approved",
      reasonCode: 1100,
    };
    const response = await app.inject({
      method: "POST",
      url: "/api/payment/wayforpay/callback",
      payload: {
        ...body,
        merchantSignature: sign([
          body.merchantAccount,
          body.orderReference,
          "0",
          body.currency,
          body.authCode,
          body.cardPan,
          body.transactionStatus,
          String(body.reasonCode),
        ]),
      },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ status: "accept" });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        cardMaskedPan: "**** **** **** 5353",
        cardType: "MasterCard",
      }),
    );
  });

  it("return endpoint redirects the browser back to the account page", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/payment/wayforpay/return?to=card",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "orderReference=VERIFY-1-1",
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(
      "http://localhost:3000/account?card=pending",
    );
  });
});
