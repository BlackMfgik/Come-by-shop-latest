// src/routes/auth.ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  users,
  pendingRegistrations,
  userDevices,
  twoFactorCodes,
  phoneOtps,
  pendingEmailChanges,
  passwordResetTokens,
} from "../db/schema.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { sendSms, generateOtp, timingSafeCompare } from "../services/sms.js";
import {
  sendPasswordResetEmail,
  sendEmailChangeCode,
  sendTwoFactorEmail,
  sendEmailVerificationEmail,
} from "../services/email.js";
import { env } from "../env.js";

const SALT_ROUNDS = 12;
const OTP_TTL_SMS_MS = 2 * 60 * 1000; // 2 min
const OTP_TTL_2FA_MS = 10 * 60 * 1000; // 10 min
const OTP_TTL_EMAIL_MS = 10 * 60 * 1000; // 10 min
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hr
const BLOCK_DURATION_MS = 30 * 60 * 1000; // 30 min
const MAX_OTP_ATTEMPTS = 5;

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(255),
  deviceId: z.string().min(1).optional(),
});

const verifyEmailSchema = z.object({
  pendingRegistrationId: z.number().int().positive(),
  code: z.string().length(6),
  deviceId: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().min(1),
});

const twoFaSendSchema = z.object({
  userId: z.number().int().positive(),
  deviceId: z.string().min(1),
});

const twoFaVerifySchema = z.object({
  userId: z.number().int().positive(),
  deviceId: z.string().min(1),
  code: z.string().length(6),
});

const googleAuthSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  image: z.string().optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().max(1000).optional(),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
});

const sendOtpSchema = z.object({
  phone: z.string().min(10).max(20),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10).max(20),
  code: z.string().length(6),
});

const changeEmailRequestSchema = z.object({
  newEmail: z.string().email(),
});

const changeEmailConfirmSchema = z.object({
  code: z.string().length(6),
});

const passwordChangeRequestSchema = z.object({
  currentPassword: z.string().min(1),
});

const passwordChangeConfirmSchema = z.object({
  code: z.string().length(6),
  newPassword: z.string().min(6),
});

// ─── Helper types ─────────────────────────────────────────────────────────────

interface JwtPayload {
  id: number;
  email: string;
  admin: boolean;
}

function safeUser(user: typeof users.$inferSelect) {
  const {
    passwordHash: _pw,
    phoneVerified,
    cardMaskedPan,
    cardType,
    createdAt,
    updatedAt,
    ...rest
  } = user;
  return {
    ...rest,
    // Перейменовуємо camelCase Drizzle поля у snake_case для фронтенду
    phone_verified: phoneVerified,
    card_masked_pan: cardMaskedPan,
    card_type: cardType,
    created_at: createdAt,
    updated_at: updatedAt,
    /** true якщо у юзера встановлений пароль (не OAuth-only акаунт) */
    has_password: user.passwordHash !== null,
  };
}

function signToken(fastify: FastifyInstance, payload: JwtPayload): string {
  return fastify.jwt.sign(payload, { expiresIn: "30d" });
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/auth/register ────────────────────────────────────────────────
  fastify.post(
    "/register",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const result = registerSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірні дані реєстрації" });
      }
      const { email, password, name, deviceId } = result.data;

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (existing.length > 0) {
        return reply.code(409).send({ error: "Email вже використовується" });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const normalizedEmail = email.toLowerCase();
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + OTP_TTL_EMAIL_MS);
      const pendingDeviceId = deviceId ?? "email-verify";

      const [pending] = await db
        .insert(pendingRegistrations)
        .values({
          email: normalizedEmail,
          passwordHash,
          name,
          deviceId: pendingDeviceId,
          code,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: pendingRegistrations.email,
          set: {
            passwordHash,
            name,
            deviceId: pendingDeviceId,
            code,
            expiresAt,
            attempts: 0,
            createdAt: new Date(),
          },
        })
        .returning();

      if (!pending) {
        return reply.code(500).send({ error: "Помилка створення заявки" });
      }

      await sendEmailVerificationEmail(pending.email, code, pending.name);

      return reply
        .code(201)
        .send({
          requires_verification: true,
          pendingRegistrationId: pending.id,
        });
    },
  );

  // ── POST /api/auth/register/verify ────────────────────────────────────────
  fastify.post(
    "/register/verify",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const result = verifyEmailSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірні дані" });
      }
      const { pendingRegistrationId, code, deviceId } = result.data;

      const [row] = await db
        .select()
        .from(pendingRegistrations)
        .where(eq(pendingRegistrations.id, pendingRegistrationId))
        .limit(1);

      if (!row) {
        return reply
          .code(400)
          .send({ error: "Код не знайдено або вже використано" });
      }

      if (row.attempts >= MAX_OTP_ATTEMPTS) {
        return reply
          .code(429)
          .send({ error: "Занадто багато спроб. Зареєструйтесь знову." });
      }

      if (new Date() > row.expiresAt) {
        await db
          .delete(pendingRegistrations)
          .where(eq(pendingRegistrations.id, pendingRegistrationId));
        return reply
          .code(410)
          .send({ error: "Код прострочений. Зареєструйтесь знову." });
      }

      if (!timingSafeCompare(row.code, code)) {
        await db
          .update(pendingRegistrations)
          .set({ attempts: row.attempts + 1 })
          .where(eq(pendingRegistrations.id, pendingRegistrationId));
        return reply.code(400).send({ error: "Невірний код" });
      }

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, row.email))
        .limit(1);

      if (existing.length > 0) {
        await db
          .delete(pendingRegistrations)
          .where(eq(pendingRegistrations.id, pendingRegistrationId));
        return reply
          .code(409)
          .send({ error: "Email вже використовується" });
      }

      const [user] = await db
        .insert(users)
        .values({
          email: row.email,
          passwordHash: row.passwordHash,
          name: row.name,
        })
        .returning();

      if (!user) {
        return reply.code(500).send({ error: "Помилка створення користувача" });
      }

      await db
        .delete(pendingRegistrations)
        .where(eq(pendingRegistrations.id, pendingRegistrationId));

      await db
        .insert(userDevices)
        .values({ userId: user.id, deviceId })
        .onConflictDoNothing();

      const token = signToken(fastify, {
        id: user.id,
        email: user.email,
        admin: user.admin,
      });

      return reply.code(200).send({ token, user: safeUser(user) });
    },
  );

  // ── POST /api/auth/register/resend ────────────────────────────────────────
  fastify.post(
    "/register/resend",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const { pendingRegistrationId } = request.body as {
        pendingRegistrationId?: number;
      };
      if (
        !pendingRegistrationId ||
        typeof pendingRegistrationId !== "number"
      ) {
        return reply.code(400).send({ error: "Невірні дані" });
      }

      const [existing] = await db
        .select()
        .from(pendingRegistrations)
        .where(eq(pendingRegistrations.id, pendingRegistrationId))
        .limit(1);

      if (!existing) {
        return reply.code(410).send({
          error: "Сесія реєстрації закінчилась. Зареєструйтесь знову.",
        });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db
        .update(pendingRegistrations)
        .set({ code, expiresAt, attempts: 0 })
        .where(eq(pendingRegistrations.id, pendingRegistrationId));

      await sendEmailVerificationEmail(existing.email, code, existing.name);

      return reply.code(200).send({ ok: true });
    },
  );

  // ── POST /api/auth/login ───────────────────────────────────────────────────
  fastify.post(
    "/login",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const result = loginSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірні дані" });
      }
      const { email, password, deviceId } = result.data;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user || !user.passwordHash) {
        return reply.code(401).send({ error: "Невірний email або пароль" });
      }

      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        return reply.code(401).send({ error: "Невірний email або пароль" });
      }

      // Check if this device is known
      const knownDevice = await db
        .select({ id: userDevices.id })
        .from(userDevices)
        .where(
          and(
            eq(userDevices.userId, user.id),
            eq(userDevices.deviceId, deviceId),
          ),
        )
        .limit(1);

      if (knownDevice.length === 0) {
        // Unknown device → require 2FA
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + OTP_TTL_2FA_MS);

        await db
          .insert(twoFactorCodes)
          .values({ userId: user.id, deviceId, code, expiresAt })
          .onConflictDoUpdate({
            target: twoFactorCodes.userId,
            set: { deviceId, code, expiresAt, attempts: 0 },
          });

        // Завжди надсилаємо код на email
        await sendTwoFactorEmail(user.email, code);

        // Додатково SMS якщо є верифікований телефон
        if (user.phone && user.phoneVerified) {
          await sendSms(
            user.phone,
            `Come by Shop: код підтвердження ${code}. Дійсний 10 хвилин.`,
          );
        }

        return reply.send({ requires_2fa: true, userId: user.id });
      }

      const token = signToken(fastify, {
        id: user.id,
        email: user.email,
        admin: user.admin,
      });

      return reply.send({ token, user: safeUser(user) });
    },
  );

  // ── POST /api/auth/2fa/send ────────────────────────────────────────────────
  fastify.post(
    "/2fa/send",
    {
      config: {
        rateLimit: { max: 3, timeWindow: "10 minutes" },
      },
    },
    async (request, reply) => {
      const result = twoFaSendSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірні дані" });
      }
      const { userId, deviceId } = result.data;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user || !user.phone || !user.phoneVerified) {
        return reply.code(400).send({ error: "Телефон не підтверджено" });
      }

      const code = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_TTL_2FA_MS);

      await db
        .insert(twoFactorCodes)
        .values({ userId, deviceId, code, expiresAt })
        .onConflictDoUpdate({
          target: twoFactorCodes.userId,
          set: { deviceId, code, expiresAt, attempts: 0 },
        });

      await sendSms(
        user.phone,
        `Come by Shop: код підтвердження входу ${code}. Дійсний 10 хвилин.`,
      );

      return reply.send({ ok: true });
    },
  );

  // ── POST /api/auth/2fa/verify ──────────────────────────────────────────────
  fastify.post("/2fa/verify", async (request, reply) => {
    const result = twoFaVerifySchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: "Невірні дані" });
    }
    const { userId, deviceId, code } = result.data;

    const [record] = await db
      .select()
      .from(twoFactorCodes)
      .where(eq(twoFactorCodes.userId, userId))
      .limit(1);

    if (!record) {
      return reply.code(400).send({ error: "Код не знайдено" });
    }

    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      await db.delete(twoFactorCodes).where(eq(twoFactorCodes.userId, userId));
      return reply
        .code(429)
        .send({ error: "Забагато спроб. Запросіть новий код." });
    }

    if (new Date() > record.expiresAt) {
      await db.delete(twoFactorCodes).where(eq(twoFactorCodes.userId, userId));
      return reply.code(400).send({ error: "Код прострочено" });
    }

    if (!timingSafeCompare(record.code, code) || record.deviceId !== deviceId) {
      await db
        .update(twoFactorCodes)
        .set({ attempts: record.attempts + 1 })
        .where(eq(twoFactorCodes.userId, userId));
      return reply.code(400).send({ error: "Невірний код" });
    }

    // Code is valid — register device and delete code
    await db
      .insert(userDevices)
      .values({ userId, deviceId })
      .onConflictDoNothing();

    await db.delete(twoFactorCodes).where(eq(twoFactorCodes.userId, userId));

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return reply.code(404).send({ error: "Користувача не знайдено" });
    }

    const token = signToken(fastify, {
      id: user.id,
      email: user.email,
      admin: user.admin,
    });

    return reply.send({ token, user: safeUser(user) });
  });

  // ── POST /api/auth/google ──────────────────────────────────────────────────
  fastify.post("/google", async (request, reply) => {
    const result = googleAuthSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: "Невірні дані" });
    }
    const { email, name } = result.data;

    const normalizedEmail = email.toLowerCase();
    const displayName = name ?? normalizedEmail.split("@")[0] ?? "User";

    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      const [created] = await db
        .insert(users)
        .values({ email: normalizedEmail, name: displayName })
        .returning();
      if (!created) {
        return reply.code(500).send({ error: "Помилка створення користувача" });
      }
      user = created;
    }

    const token = signToken(fastify, {
      id: user.id,
      email: user.email,
      admin: user.admin,
    });

    return reply.send({ token, user: safeUser(user) });
  });

  // ── GET /api/auth/me ───────────────────────────────────────────────────────
  fastify.get("/me", { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as JwtPayload;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.id))
      .limit(1);

    if (!user) {
      return reply.code(404).send({ error: "Користувача не знайдено" });
    }

    return reply.send(safeUser(user));
  });

  // ── PUT /api/auth/profile ──────────────────────────────────────────────────
  fastify.put(
    "/profile",
    { preHandler: requireAuth },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const result = updateProfileSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірні дані" });
      }

      const updates: Partial<{ name: string; address: string }> = {};
      if (result.data.name !== undefined) updates.name = result.data.name;
      if (result.data.address !== undefined)
        updates.address = result.data.address;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: "Нічого оновлювати" });
      }

      const [user] = await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, payload.id))
        .returning();

      if (!user) {
        return reply.code(404).send({ error: "Користувача не знайдено" });
      }

      return reply.send(safeUser(user));
    },
  );

  // ── PUT /api/auth/password ─────────────────────────────────────────────────
  fastify.put(
    "/password",
    { preHandler: requireAuth },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const result = changePasswordSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірні дані" });
      }
      const { oldPassword, newPassword } = result.data;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.id))
        .limit(1);

      if (!user || !user.passwordHash) {
        return reply.code(400).send({ error: "Зміна пароля недоступна" });
      }

      const match = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!match) {
        return reply.code(401).send({ error: "Невірний поточний пароль" });
      }

      const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, payload.id));

      return reply.send({ ok: true });
    },
  );

  // ── POST /api/auth/reset-password ─────────────────────────────────────────
  fastify.post(
    "/reset-password",
    {
      config: {
        rateLimit: { max: 3, timeWindow: "15 minutes" },
      },
    },
    async (request, reply) => {
      const result = resetPasswordSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірний email" });
      }
      const { email } = result.data;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      // Always return success to avoid email enumeration
      if (!user) {
        return reply.send({ ok: true });
      }

      const token = crypto.randomBytes(64).toString("hex");
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      await sendPasswordResetEmail(user.email, token, user.name);

      return reply.send({ ok: true });
    },
  );

  // ── POST /api/auth/reset-password/confirm ─────────────────────────────────
  fastify.post("/reset-password/confirm", async (request, reply) => {
    const result = resetPasswordConfirmSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ error: "Невірні дані" });
    }
    const { token, newPassword } = result.data;

    const [record] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);

    if (!record || record.used || new Date() > record.expiresAt) {
      return reply
        .code(400)
        .send({ error: "Недійсний або прострочений токен" });
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, record.userId));

    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, record.id));

    return reply.send({ ok: true });
  });

  // ── POST /api/auth/phone/send-otp ─────────────────────────────────────────
  fastify.post(
    "/phone/send-otp",
    {
      preHandler: requireAuth,
      config: {
        rateLimit: { max: 3, timeWindow: "10 minutes" },
      },
    },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const result = sendOtpSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірний номер телефону" });
      }
      const { phone } = result.data;

      const code = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_TTL_SMS_MS);

      await db
        .insert(phoneOtps)
        .values({ userId: payload.id, phone, code, expiresAt })
        .onConflictDoUpdate({
          target: phoneOtps.userId,
          set: { phone, code, expiresAt, attempts: 0, blockedUntil: null },
        });

      await sendSms(
        phone,
        `Come by Shop: ваш код підтвердження ${code}. Дійсний 2 хвилини.`,
      );

      return reply.send({ ok: true });
    },
  );

  // ── POST /api/auth/phone/verify-otp ───────────────────────────────────────
  fastify.post(
    "/phone/verify-otp",
    { preHandler: requireAuth },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const result = verifyOtpSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірні дані" });
      }
      const { phone, code } = result.data;

      const [record] = await db
        .select()
        .from(phoneOtps)
        .where(eq(phoneOtps.userId, payload.id))
        .limit(1);

      if (!record || record.phone !== phone) {
        return reply.code(400).send({ error: "OTP не знайдено" });
      }

      if (record.blockedUntil !== null && new Date() < record.blockedUntil) {
        return reply
          .code(429)
          .send({ error: "Заблоковано. Спробуйте пізніше." });
      }

      if (record.attempts >= MAX_OTP_ATTEMPTS) {
        const blockedUntil = new Date(Date.now() + BLOCK_DURATION_MS);
        await db
          .update(phoneOtps)
          .set({ blockedUntil })
          .where(eq(phoneOtps.userId, payload.id));
        return reply
          .code(429)
          .send({ error: "Забагато спроб. Заблоковано на 30 хвилин." });
      }

      if (new Date() > record.expiresAt) {
        await db.delete(phoneOtps).where(eq(phoneOtps.userId, payload.id));
        return reply.code(400).send({ error: "Код прострочено" });
      }

      if (!timingSafeCompare(record.code, code)) {
        await db
          .update(phoneOtps)
          .set({ attempts: record.attempts + 1 })
          .where(eq(phoneOtps.userId, payload.id));
        return reply.code(400).send({ error: "Невірний код" });
      }

      await db
        .update(users)
        .set({ phone, phoneVerified: true, updatedAt: new Date() })
        .where(eq(users.id, payload.id));

      await db.delete(phoneOtps).where(eq(phoneOtps.userId, payload.id));

      // Повертаємо оновленого юзера (фронтенд очікує UserInfo, не просто { ok: true })
      const [updatedUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.id))
        .limit(1);

      return reply.send(safeUser(updatedUser!));
    },
  );

  // ── POST /api/auth/change-email/request ───────────────────────────────────
  fastify.post(
    "/change-email/request",
    { preHandler: requireAuth },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const result = changeEmailRequestSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірний email" });
      }
      const { newEmail } = result.data;

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, newEmail.toLowerCase()))
        .limit(1);

      if (existing.length > 0) {
        return reply.code(409).send({ error: "Email вже використовується" });
      }

      const [user] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, payload.id))
        .limit(1);

      if (!user) {
        return reply.code(404).send({ error: "Користувача не знайдено" });
      }

      const code = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_TTL_EMAIL_MS);

      await db
        .insert(pendingEmailChanges)
        .values({
          userId: payload.id,
          newEmail: newEmail.toLowerCase(),
          code,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: pendingEmailChanges.userId,
          set: { newEmail: newEmail.toLowerCase(), code, expiresAt },
        });

      await sendEmailChangeCode(newEmail, code, user.name);

      return reply.send({ ok: true });
    },
  );

  // ── POST /api/auth/change-email/confirm ───────────────────────────────────
  fastify.post(
    "/change-email/confirm",
    { preHandler: requireAuth },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const result = changeEmailConfirmSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірний код" });
      }
      const { code } = result.data;

      const [record] = await db
        .select()
        .from(pendingEmailChanges)
        .where(eq(pendingEmailChanges.userId, payload.id))
        .limit(1);

      if (!record) {
        return reply.code(400).send({ error: "Запит не знайдено" });
      }

      if (new Date() > record.expiresAt) {
        await db
          .delete(pendingEmailChanges)
          .where(eq(pendingEmailChanges.userId, payload.id));
        return reply.code(400).send({ error: "Код прострочено" });
      }

      if (!timingSafeCompare(record.code, code)) {
        return reply.code(400).send({ error: "Невірний код" });
      }

      // Check email still free
      const conflict = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, record.newEmail))
        .limit(1);

      if (conflict.length > 0) {
        return reply.code(409).send({ error: "Email вже використовується" });
      }

      await db
        .update(users)
        .set({ email: record.newEmail, updatedAt: new Date() })
        .where(eq(users.id, payload.id));

      await db
        .delete(pendingEmailChanges)
        .where(eq(pendingEmailChanges.userId, payload.id));

      return reply.send({ ok: true });
    },
  );

  // ── POST /api/auth/password-change/request ────────────────────────────────
  fastify.post(
    "/password-change/request",
    { preHandler: requireAuth },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const result = passwordChangeRequestSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірні дані" });
      }
      const { currentPassword } = result.data;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.id))
        .limit(1);

      if (!user || !user.passwordHash) {
        return reply.code(400).send({ error: "Помилка верифікації" });
      }

      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) {
        return reply.code(401).send({ error: "Невірний поточний пароль" });
      }

      if (!user.phone || !user.phoneVerified) {
        return reply.code(400).send({ error: "Телефон не підтверджено" });
      }

      const code = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_TTL_SMS_MS);

      await db
        .insert(phoneOtps)
        .values({ userId: payload.id, phone: user.phone, code, expiresAt })
        .onConflictDoUpdate({
          target: phoneOtps.userId,
          set: {
            phone: user.phone,
            code,
            expiresAt,
            attempts: 0,
            blockedUntil: null,
          },
        });

      await sendSms(
        user.phone,
        `Come by Shop: код для зміни пароля ${code}. Дійсний 2 хвилини.`,
      );

      return reply.send({ ok: true });
    },
  );

  // ── POST /api/auth/password-change/confirm ────────────────────────────────
  fastify.post(
    "/password-change/confirm",
    { preHandler: requireAuth },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      const result = passwordChangeConfirmSchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Невірні дані" });
      }
      const { code, newPassword } = result.data;

      const [record] = await db
        .select()
        .from(phoneOtps)
        .where(eq(phoneOtps.userId, payload.id))
        .limit(1);

      if (!record) {
        return reply.code(400).send({ error: "OTP не знайдено" });
      }

      if (record.blockedUntil !== null && new Date() < record.blockedUntil) {
        return reply
          .code(429)
          .send({ error: "Заблоковано. Спробуйте пізніше." });
      }

      if (record.attempts >= MAX_OTP_ATTEMPTS) {
        const blockedUntil = new Date(Date.now() + BLOCK_DURATION_MS);
        await db
          .update(phoneOtps)
          .set({ blockedUntil })
          .where(eq(phoneOtps.userId, payload.id));
        return reply
          .code(429)
          .send({ error: "Забагато спроб. Заблоковано на 30 хвилин." });
      }

      if (new Date() > record.expiresAt) {
        await db.delete(phoneOtps).where(eq(phoneOtps.userId, payload.id));
        return reply.code(400).send({ error: "Код прострочено" });
      }

      if (!timingSafeCompare(record.code, code)) {
        await db
          .update(phoneOtps)
          .set({ attempts: record.attempts + 1 })
          .where(eq(phoneOtps.userId, payload.id));
        return reply.code(400).send({ error: "Невірний код" });
      }

      const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

      await db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, payload.id));

      await db.delete(phoneOtps).where(eq(phoneOtps.userId, payload.id));

      return reply.send({ ok: true });
    },
  );

  // ── POST /api/auth/verify-password ────────────────────────────────────────
  fastify.post(
    "/verify-password",
    { preHandler: requireAuth },
    async (request, reply) => {
      const payload = request.user as JwtPayload;

      const bodySchema = z.object({ password: z.string().min(1) });
      const result = bodySchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({ error: "Введіть пароль" });
      }

      const [user] = await db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, payload.id))
        .limit(1);

      if (!user) {
        return reply.code(404).send({ error: "Користувача не знайдено" });
      }

      // OAuth-юзер без пароля — підтвердження не потрібне
      if (!user.passwordHash) {
        return reply.send({ ok: true });
      }

      const match = await bcrypt.compare(
        result.data.password,
        user.passwordHash,
      );
      if (!match) {
        return reply.code(400).send({ error: "Невірний пароль" });
      }

      return reply.send({ ok: true });
    },
  );
}
