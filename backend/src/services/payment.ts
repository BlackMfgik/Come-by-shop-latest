// src/services/payment.ts
import crypto from "node:crypto";
import { env } from "../env.js";

const WAYFORPAY_API = "https://api.wayforpay.com/api";

interface WayForPayInitParams {
  serviceUrl: string;
  orderId: string;
  orderDate: number;
  amount: string;
  currency: string;
  productNames: string[];
  productCounts: number[];
  productPrices: string[];
  clientEmail: string;
  clientPhone?: string;
}

interface WayForPayResponse {
  invoiceUrl?: string;
  reason?: string;
  reasonCode?: number;
}

interface WayForPayCallbackBody {
  merchantAccount: string;
  orderReference: string;
  merchantSignature: string;
  amount: string | number;
  currency: string;
  authCode?: string;
  email?: string;
  phone?: string;
  cardPan?: string;
  cardType?: string;
  transactionStatus?: string;
  [key: string]: unknown;
}

function buildSignature(fields: string[]): string {
  const signString = fields.join(";");
  return crypto
    .createHmac("md5", env.WAYFORPAY_SECRET_KEY)
    .update(signString)
    .digest("hex");
}

export async function initWayForPayPayment(
  params: WayForPayInitParams,
): Promise<string> {
  const {
    serviceUrl,
    orderId,
    orderDate,
    amount,
    currency,
    productNames,
    productCounts,
    productPrices,
    clientEmail,
    clientPhone,
  } = params;

  const signatureFields = [
    env.WAYFORPAY_MERCHANT_ACCOUNT,
    env.WAYFORPAY_DOMAIN,
    orderId,
    orderDate.toString(),
    amount,
    currency,
    ...productNames,
    ...productCounts.map(String),
    ...productPrices,
  ];

  const merchantSignature = buildSignature(signatureFields);

  const body = {
    transactionType: "CREATE_INVOICE",
    merchantAccount: env.WAYFORPAY_MERCHANT_ACCOUNT,
    merchantDomainName: env.WAYFORPAY_DOMAIN,
    merchantSignature,
    apiVersion: 1,
    language: "UA",
    serviceUrl,
    returnUrl: `${env.ALLOWED_ORIGIN}/account?tab=orders`,
    orderReference: orderId,
    orderDate,
    amount,
    currency,
    productName: productNames,
    productCount: productCounts,
    productPrice: productPrices,
    clientEmail,
    ...(clientPhone != null ? { clientPhone } : {}),
  };

  const response = await fetch(WAYFORPAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`WayForPay API error: ${response.status}`);
  }

  const data = (await response.json()) as WayForPayResponse;

  if (!data.invoiceUrl) {
    throw new Error(
      `WayForPay: ${data.reason ?? "Помилка ініціалізації платежу"}`,
    );
  }

  return data.invoiceUrl;
}

export function verifyWayForPayCallback(body: WayForPayCallbackBody): boolean {
  const {
    merchantAccount,
    orderReference,
    amount,
    currency,
    authCode,
    cardPan,
    transactionStatus,
    reasonCode,
  } = body as WayForPayCallbackBody & {
    reasonCode?: number;
    authCode?: string;
  };

  const signatureFields = [
    merchantAccount,
    orderReference,
    String(amount),
    currency,
    authCode ?? "",
    cardPan ?? "",
    transactionStatus ?? "",
    String(reasonCode ?? ""),
  ];

  const expected = buildSignature(signatureFields);
  const received = body["merchantSignature"] as string;

  if (typeof received !== "string") return false;

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  // timingSafeEqual кидає виняток на буферах різної довжини
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function buildWayForPayResponse(
  orderReference: string,
  status: "accept" | "decline",
): object {
  const time = Math.floor(Date.now() / 1000);
  const signatureFields = [orderReference, status, time.toString()];
  const signature = buildSignature(signatureFields);

  return {
    orderReference,
    status,
    time,
    signature,
  };
}
