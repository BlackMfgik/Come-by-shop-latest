// src/services/sms.ts
import nodeCrypto from "node:crypto";
import { env } from "../env.js";

const TURBOSMS_API = "https://api.turbosms.ua/message/send";

// DEV_OTP випадково заданий на продакшені = вхід з кодом 000000 для будь-кого
const DEV_OTP =
  process.env.NODE_ENV === "production" ? undefined : env.DEV_OTP;

export async function sendSms(phone: string, text: string): Promise<void> {
  // DEV режим: не надсилаємо реальний SMS, просто логуємо
  if (DEV_OTP) {
    console.log(`[DEV SMS] → ${phone}: ${text}`);
    return;
  }

  const body = {
    recipients: [phone],
    sms: {
      sender: env.TURBOSMS_SENDER,
      text,
    },
  };

  const response = await fetch(TURBOSMS_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.TURBOSMS_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TurboSMS error ${response.status}: ${errorText}`);
  }
}

export function generateOtp(): string {
  // DEV режим: завжди повертаємо фіксований код
  if (DEV_OTP) {
    return DEV_OTP;
  }

  return nodeCrypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = Buffer.from(a, "utf8");
  const bBytes = Buffer.from(b, "utf8");
  return nodeCrypto.timingSafeEqual(aBytes, bBytes);
}
