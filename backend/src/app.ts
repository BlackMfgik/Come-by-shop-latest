// src/app.ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";

import { env } from "./env.js";

import { authRoutes } from "./routes/auth.js";
import { productsRoutes } from "./routes/products.js";
import { ordersRoutes } from "./routes/orders.js";
import { paymentRoutes } from "./routes/payment.js";

const isProduction = process.env.NODE_ENV === "production";

const app = Fastify({
  logger: isProduction
    ? true
    : {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        } as any,
      },
});

// ─── Plugins ─────────────────────────────────────────────────────────────────

await app.register(helmet);

await app.register(cors, {
  origin: env.ALLOWED_ORIGIN,
  credentials: true,
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

await app.register(jwt, {
  secret: env.JWT_SECRET,
});

// ─── Routes ──────────────────────────────────────────────────────────────────

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(productsRoutes, { prefix: "/api/products" });
await app.register(ordersRoutes, { prefix: "/api/orders" });
await app.register(paymentRoutes, { prefix: "/api/payment" });

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", async () => ({ status: "ok" }));

// ─── Start ───────────────────────────────────────────────────────────────────

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
