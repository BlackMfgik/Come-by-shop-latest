// src/services/email.ts
import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "../env.js";

type EmailMessage = {
  to: string;
  subject: string;
  html: string;
};

const EMAIL_SEND_TIMEOUT_MS = 12_000;
let smtpTransporter: Transporter | null = null;
let resolvedSmtpHost: string | null = null;

async function withEmailTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("EMAIL_SEND_TIMEOUT"));
        }, EMAIL_SEND_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function resetSmtpTransporter(): void {
  if (smtpTransporter) {
    smtpTransporter.close();
    smtpTransporter = null;
  }
}

async function getSmtpHostAddress(host: string): Promise<string> {
  if (isIP(host)) return host;
  if (resolvedSmtpHost) return resolvedSmtpHost;

  const result = await withEmailTimeout(lookup(host, { family: 4 }));
  resolvedSmtpHost = result.address;
  return resolvedSmtpHost;
}

function createEmailSendError(): Error {
  return new Error("Не вдалося надіслати лист. Спробуйте ще раз трохи пізніше.");
}

async function getSmtpTransporter(): Promise<Transporter> {
  if (smtpTransporter) return smtpTransporter;

  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error(
      "SMTP не налаштовано. Заповніть SMTP_HOST, SMTP_PORT, SMTP_USER і SMTP_PASS у backend/.env",
    );
  }

  const smtpHost = env.SMTP_HOST;
  const smtpHostAddress = await getSmtpHostAddress(smtpHost);

  smtpTransporter = nodemailer.createTransport({
    host: smtpHostAddress,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    dnsTimeout: EMAIL_SEND_TIMEOUT_MS,
    connectionTimeout: EMAIL_SEND_TIMEOUT_MS,
    greetingTimeout: EMAIL_SEND_TIMEOUT_MS,
    socketTimeout: EMAIL_SEND_TIMEOUT_MS,
    tls: {
      servername: smtpHost,
    },
  });

  return smtpTransporter;
}

async function sendEmail({ to, subject, html }: EmailMessage): Promise<void> {
  if (env.EMAIL_PROVIDER === "smtp") {
    try {
      const transporter = await getSmtpTransporter();
      await withEmailTimeout(
        transporter.sendMail({
          from: env.EMAIL_FROM_ADDRESS,
          to,
          subject,
          html,
        }),
      );
    } catch {
      resetSmtpTransporter();
      throw createEmailSendError();
    }
    return;
  }

  if (!env.EMAIL_PROVIDER_API_KEY) {
    throw new Error(
      "Resend не налаштовано. Заповніть EMAIL_PROVIDER_API_KEY або використайте EMAIL_PROVIDER=smtp",
    );
  }

  const resend = new Resend(env.EMAIL_PROVIDER_API_KEY);
  try {
    await withEmailTimeout(
      resend.emails.send({
        from: env.EMAIL_FROM_ADDRESS,
        to,
        subject,
        html,
      }),
    );
  } catch {
    throw createEmailSendError();
  }
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
  userName: string,
): Promise<void> {
  const resetUrl = `${env.ALLOWED_ORIGIN}/reset-password?token=${resetToken}`;

  await sendEmail({
    to: toEmail,
    subject: "Скидання пароля — Come by Shop",
    html: `
      <h2>Привіт, ${userName}!</h2>
      <p>Ви отримали цей лист тому що запросили скидання пароля.</p>
      <p>Натисніть на посилання нижче, щоб встановити новий пароль:</p>
      <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#222;color:#fff;text-decoration:none;border-radius:6px;">
        Скинути пароль
      </a>
      <p>Посилання дійсне протягом 1 години.</p>
      <p>Якщо ви не робили цього запиту — просто проігноруйте цей лист.</p>
    `,
  });
}

export async function sendTwoFactorEmail(
  toEmail: string,
  code: string,
): Promise<void> {
  await sendEmail({
    to: toEmail,
    subject: "Підтвердження входу — Come by Shop",
    html: `
      <h2>Підтвердження входу</h2>
      <p>Хтось (сподіваємось, ви) входить у ваш акаунт Come by Shop з нового пристрою.</p>
      <p>Ваш одноразовий код:</p>
      <h1 style="font-size:48px;letter-spacing:12px;font-family:monospace;color:#009956;">${code}</h1>
      <p>Код дійсний протягом 10 хвилин.</p>
      <p>Якщо це не ви — негайно змініть пароль.</p>
    `,
  });
}

export async function sendEmailChangeCode(
  toEmail: string,
  code: string,
  userName: string,
): Promise<void> {
  await sendEmail({
    to: toEmail,
    subject: "Підтвердження зміни email — Come by Shop",
    html: `
      <h2>Привіт, ${userName}!</h2>
      <p>Ваш код підтвердження для зміни email адреси:</p>
      <h1 style="font-size:40px;letter-spacing:8px;font-family:monospace;">${code}</h1>
      <p>Код дійсний протягом 10 хвилин.</p>
      <p>Якщо ви не робили цього запиту — проігноруйте цей лист.</p>
    `,
  });
}

export async function sendEmailVerificationEmail(
  toEmail: string,
  code: string,
  name: string,
): Promise<void> {
  await sendEmail({
    to: toEmail,
    subject: "Підтвердження реєстрації — Come by Shop",
    html: `
      <h2>Вітаємо, ${name}!</h2>
      <p>Для завершення реєстрації введіть цей код підтвердження:</p>
      <h1 style="font-size:48px;letter-spacing:12px;font-family:monospace;color:#009956;">${code}</h1>
      <p>Код дійсний протягом 10 хвилин.</p>
      <p>Якщо ви не реєструвались на Come by Shop — проігноруйте цей лист.</p>
    `,
  });
}
