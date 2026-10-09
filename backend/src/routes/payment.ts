// src/routes/payment.ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { orders, orderItems, users } from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  buildWayForPayVerifyForm,
  initWayForPayPayment,
  verifyWayForPayCallback,
  buildWayForPayResponse,
} from "../services/payment.js";
import { env } from "../env.js";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const initPaymentSchema = z.object({
  orderId: z.number().int().positive().optional(),
  currency: z.string().length(3).default("UAH"),
});

const callbackSchema = z.object({
  merchantAccount: z.string(),
  orderReference: z.string(),
  merchantSignature: z.string(),
  // WayForPay надсилає суму числом
  amount: z.union([z.number(), z.string()]),
  currency: z.string(),
  transactionStatus: z.string().optional(),
  cardPan: z.string().optional(),
  cardType: z.string().optional(),
  authCode: z.string().optional(),
  reasonCode: z.number().optional(),
});

// ─── JWT payload type ─────────────────────────────────────────────────────────

interface JwtPayload {
  id: number;
  email: string;
  admin: boolean;
}

// Локальна розробка без WayForPay: тестова форма картки замість справжньої верифікації
const DEV_MODE = process.env.NODE_ENV !== "production" && !!env.DEV_OTP;

const VERIFY_REF = /^VERIFY-(\d+)-\d+$/;
const ORDER_REF = /^ORDER-(\d+)$/;

const devCardSchema = z.object({
  cardNumber: z.string().regex(/^\d{16}$/),
});

function apiBase(request: FastifyRequest): string {
  return (
    env.PUBLIC_API_URL ?? `${request.protocol}://${request.host}`
  ).replace(/\/$/, "");
}

function maskPan(pan: string): string {
  const last4 = pan.replace(/\D/g, "").slice(-4);
  return `**** **** **** ${last4}`;
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function paymentRoutes(fastify: FastifyInstance): Promise<void> {
  // WayForPay шле JSON з Content-Type application/x-www-form-urlencoded
  fastify.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      const text = String(body);
      try {
        done(null, JSON.parse(text));
        return;
      } catch {
        // Інколи JSON приходить як єдиний ключ form-urlencoded тіла
      }
      try {
        const params = new URLSearchParams(text);
        const keys = [...params.keys()];
        if (keys.length === 1 && keys[0]!.trim().startsWith("{")) {
          done(null, JSON.parse(keys[0]!));
          return;
        }
        done(null, Object.fromEntries(params));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // ── POST /api/payment/wayforpay/init ──────────────────────────────────────
  fastify.post(
    "/wayforpay/init",
    { preHandler: requireAuth },
    async (request, reply) => {
      const payload = request.user as JwtPayload;

      const result = initPaymentSchema.safeParse(request.body ?? {});
      if (!result.success) {
        return reply.code(400).send({ error: "Невірні дані" });
      }
      const { orderId, currency } = result.data;

      // Без orderId — прив'язка картки через WayForPay Card Verify
      if (!orderId) {
        if (DEV_MODE) return reply.send({ mock: true });

        const [user] = await db
          .select({ email: users.email, phone: users.phone })
          .from(users)
          .where(eq(users.id, payload.id))
          .limit(1);

        if (!user) {
          return reply.code(404).send({ error: "Користувача не знайдено" });
        }

        const base = apiBase(request);
        const verify = buildWayForPayVerifyForm({
          orderReference: `VERIFY-${payload.id}-${Date.now()}`,
          serviceUrl: `${base}/api/payment/wayforpay/callback`,
          returnUrl: `${base}/api/payment/wayforpay/return?to=card`,
          clientEmail: user.email,
          clientPhone: user.phone ?? undefined,
        });

        return reply.send({ verify });
      }

      // Verify order belongs to this user
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) {
        return reply.code(404).send({ error: "Замовлення не знайдено" });
      }

      if (order.userId !== payload.id) {
        return reply.code(403).send({ error: "Доступ заборонено" });
      }

      // Fetch order items
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      if (items.length === 0) {
        return reply.code(400).send({ error: "Замовлення не містить товарів" });
      }

      // Fetch user for email
      const [user] = await db
        .select({ email: users.email, phone: users.phone })
        .from(users)
        .where(eq(users.id, payload.id))
        .limit(1);

      if (!user) {
        return reply.code(404).send({ error: "Користувача не знайдено" });
      }

      const orderDate = Math.floor(order.createdAt.getTime() / 1000);
      const orderReference = `ORDER-${orderId}`;

      const productNames = items.map((i) => i.productName);
      const productCounts = items.map((i) => i.quantity);
      const productPrices = items.map((i) => parseFloat(i.price).toFixed(2));

      const base = apiBase(request);

      let invoiceUrl: string;
      try {
        invoiceUrl = await initWayForPayPayment({
          serviceUrl: `${base}/api/payment/wayforpay/callback`,
          returnUrl: `${base}/api/payment/wayforpay/return?to=orders`,
          orderId: orderReference,
          orderDate,
          amount: parseFloat(order.total).toFixed(2),
          currency,
          productNames,
          productCounts,
          productPrices,
          clientEmail: user.email,
          ...(user.phone != null ? { clientPhone: user.phone } : {}),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Помилка платежу";
        return reply.code(502).send({ error: message });
      }

      return reply.send({ url: invoiceUrl });
    },
  );

  // ── POST /api/payment/wayforpay/callback ──────────────────────────────────
  // Public endpoint — no auth, but HMAC verified
  fastify.post("/wayforpay/callback", async (request, reply) => {
    const rawBody = request.body as Record<string, unknown>;

    const result = callbackSchema.safeParse(rawBody);
    if (!result.success) {
      return reply.code(400).send({ error: "Невірні дані" });
    }

    const callbackData = result.data;

    // Verify HMAC signature
    const isValid = verifyWayForPayCallback(
      rawBody as Parameters<typeof verifyWayForPayCallback>[0],
    );

    if (!isValid) {
      fastify.log.warn(
        { orderReference: callbackData.orderReference },
        "WayForPay callback: invalid HMAC",
      );
      return reply.code(400).send({ error: "Невірний підпис" });
    }

    // Only process approved transactions
    if (callbackData.transactionStatus !== "Approved") {
      const response = buildWayForPayResponse(
        callbackData.orderReference,
        "decline",
      );
      return reply.send(response);
    }

    if (callbackData.merchantAccount !== env.WAYFORPAY_MERCHANT_ACCOUNT) {
      return reply.code(400).send({ error: "Невірний мерчант" });
    }

    // ── Прив'язка картки (Card Verify) ──────────────────────────────────────
    const verifyMatch = VERIFY_REF.exec(callbackData.orderReference);
    if (verifyMatch) {
      const userId = Number(verifyMatch[1]);
      if (!callbackData.cardPan) {
        return reply.code(400).send({ error: "Немає даних картки" });
      }

      // Зберігаємо лише маску — повний номер WayForPay не передає
      await db
        .update(users)
        .set({
          cardMaskedPan: maskPan(callbackData.cardPan),
          cardType: callbackData.cardType ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      return reply.send(
        buildWayForPayResponse(callbackData.orderReference, "accept"),
      );
    }

    // ── Оплата замовлення ───────────────────────────────────────────────────
    const match = ORDER_REF.exec(callbackData.orderReference);
    const orderId = match ? Number(match[1]) : NaN;

    if (!Number.isSafeInteger(orderId)) {
      return reply.code(400).send({ error: "Невірний orderReference" });
    }

    const [order] = await db
      .select({ userId: orders.userId, total: orders.total })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      return reply.code(404).send({ error: "Замовлення не знайдено" });
    }

    // Сума оплати має збігатися з сумою замовлення в БД
    if (
      Number(callbackData.amount).toFixed(2) !== Number(order.total).toFixed(2)
    ) {
      fastify.log.warn(
        { orderReference: callbackData.orderReference },
        "WayForPay callback: amount mismatch",
      );
      return reply.code(400).send({ error: "Невірна сума" });
    }

    // Save masked card info — never log full PAN
    if (callbackData.cardPan) {
      await db
        .update(users)
        .set({
          cardMaskedPan: maskPan(callbackData.cardPan),
          cardType: callbackData.cardType ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, order.userId));
    }

    // Update order status
    await db
      .update(orders)
      .set({ status: "Оплачено" })
      .where(eq(orders.id, orderId));

    const response = buildWayForPayResponse(
      callbackData.orderReference,
      "accept",
    );

    return reply.send(response);
  });
  // ── GET|POST /api/payment/wayforpay/return ────────────────────────────────
  // WayForPay повертає юзера POST-запитом, тому returnUrl веде сюди, а не на сторінку Next.js
  fastify.route<{ Querystring: { to?: string } }>({
    method: ["GET", "POST"],
    url: "/wayforpay/return",
    handler: async (request, reply) => {
      const target =
        request.query.to === "card"
          ? "/account?card=pending"
          : "/account?tab=orders";
      return reply.redirect(`${env.ALLOWED_ORIGIN}${target}`, 303);
    },
  });

  // ── POST /api/payment/dev/card — тільки для локальної розробки ────────────
  if (DEV_MODE) {
    fastify.post(
      "/dev/card",
      { preHandler: requireAuth },
      async (request, reply) => {
        const payload = request.user as JwtPayload;
        const result = devCardSchema.safeParse(request.body);
        if (!result.success) {
          return reply.code(400).send({ error: "Невірний номер картки" });
        }
        const { cardNumber } = result.data;
        const cardType = cardNumber.startsWith("4") ? "Visa" : "MasterCard";

        const [user] = await db
          .update(users)
          .set({
            cardMaskedPan: maskPan(cardNumber),
            cardType,
            updatedAt: new Date(),
          })
          .where(eq(users.id, payload.id))
          .returning({ id: users.id });

        if (!user) {
          return reply.code(404).send({ error: "Користувача не знайдено" });
        }
        return reply.send({ ok: true });
      },
    );
  }
}
