// src/env.ts
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    ALLOWED_ORIGIN: z.string().url(),

    TURBOSMS_TOKEN: z.string().min(1),
    TURBOSMS_SENDER: z.string().min(1),

    WAYFORPAY_MERCHANT_ACCOUNT: z.string().min(1),
    WAYFORPAY_SECRET_KEY: z.string().min(1),
    WAYFORPAY_DOMAIN: z.string().min(1),

    EMAIL_PROVIDER: z.enum(["resend", "smtp"]).default("resend"),
    EMAIL_PROVIDER_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM_ADDRESS: z.string().email(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : undefined)),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),

    GOOGLE_CLIENT_ID: z.string().min(1),

    // Публічна адреса бекенду для WayForPay serviceUrl (напр. https://api.come-by-shop.com)
    // Якщо не задано — визначається з заголовків запиту
    PUBLIC_API_URL: z.string().url().optional(),

    // Тільки для розробки: фіксований OTP-код, SMS не надсилається
    // Приклад: DEV_OTP=000000
    DEV_OTP: z.string().length(6).optional(),

    PORT: z
      .string()
      .default("4000")
      .transform((v) => parseInt(v, 10)),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
