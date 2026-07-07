import { z } from "zod";

// ── Login ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().min(1, "Введіть email").email("Невірний формат email"),
  password: z.string().min(1, "Введіть пароль"),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// ── Registration ──────────────────────────────────────────────────────────────

export const registrationSchema = z
  .object({
    name: z
      .string()
      .min(1, "Введіть ваше ім'я")
      .min(2, "Ім'я має бути не менше 2 символів")
      .max(50, "Ім'я занадто довге"),
    email: z.string().min(1, "Введіть email").email("Невірний формат email"),
    password: z
      .string()
      .min(6, "Пароль має бути не менше 6 символів")
      .max(100, "Пароль занадто довгий"),
    confirm: z.string().min(1, "Підтвердіть пароль"),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Паролі не співпадають",
    path: ["confirm"],
  });

export type RegistrationFormData = z.infer<typeof registrationSchema>;

// ── Forgot password ───────────────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Введіть email").email("Невірний формат email"),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, "Пароль має бути не менше 6 символів")
      .max(100, "Пароль занадто довгий"),
    confirm: z.string().min(1, "Підтвердіть пароль"),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Паролі не співпадають",
    path: ["confirm"],
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

// ── Phone (E.164 Ukraine) ─────────────────────────────────────────────────────

/**
 * Валідація номера у форматі +380XXXXXXXXX (12 цифр після +)
 * Приймає і відформатований вигляд +380 (XX) XXX-XX-XX
 */
export const phoneSchema = z.object({
  phone: z
    .string()
    .min(1, "Введіть номер телефону")
    .transform((val) => val.replace(/\D/g, ""))
    .refine(
      (digits) => digits.startsWith("380") && digits.length === 12,
      "Введіть повний номер: +380 (XX) XXX-XX-XX",
    )
    .transform((digits) => `+${digits}`),
});

export type PhoneFormData = z.infer<typeof phoneSchema>;

// ── OTP (6 цифр) ─────────────────────────────────────────────────────────────

export const otpSchema = z.object({
  code: z
    .string()
    .length(6, "Код має складатись з 6 цифр")
    .regex(/^\d{6}$/, "Тільки цифри"),
});

export type OtpFormData = z.infer<typeof otpSchema>;
