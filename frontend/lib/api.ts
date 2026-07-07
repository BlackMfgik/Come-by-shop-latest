/**
 * lib/api.ts — централізовані виклики до бекенду
 *
 * 🔌 BASE URL: process.env.NEXT_PUBLIC_API_URL (встановити в .env.local)
 *    Приклад: NEXT_PUBLIC_API_URL=https://api.come-by-shop.com
 *
 * 📋 Формат помилок від бекенду: { "error": "повідомлення" }
 * 📋 Авторизація: заголовок Authorization: Bearer <JWT токен>
 * 📋 Всі захищені ендпоінти позначені — [AUTH REQUIRED]
 * 📋 Адмін-ендпоінти позначені — [ADMIN ONLY]
 */

import type {
  AuthPayload,
  UserInfo,
  Product,
  Order,
  OrderItem,
  WayForPayInitResult,
} from "@/types";

// 🔌 BACKEND URL — встановити NEXT_PUBLIC_API_URL в .env.local
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const DEFAULT_ERROR_MESSAGE = "Сталася помилка. Спробуйте ще раз.";
const NETWORK_ERROR_MESSAGE =
  "Не вдалося підключитися до сервера. Перевірте інтернет або спробуйте ще раз за кілька хвилин.";
const SERVER_ERROR_MESSAGE =
  "На сервері сталася помилка. Спробуйте ще раз трохи пізніше.";

function authHeaders(token?: string | null): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function getStatusErrorMessage(status: number): string {
  if (status === 400) return "Перевірте введені дані та спробуйте ще раз.";
  if (status === 401) return "Будь ласка, увійдіть в акаунт і спробуйте ще раз.";
  if (status === 403) return "У вас немає доступу до цієї дії.";
  if (status === 404) return "Не вдалося знайти потрібні дані.";
  if (status === 409) return "Такі дані вже використовуються.";
  if (status === 410) return "Час дії коду або посилання минув. Спробуйте ще раз.";
  if (status === 429) return "Забагато спроб. Спробуйте трохи пізніше.";
  if (status >= 500) return SERVER_ERROR_MESSAGE;
  return DEFAULT_ERROR_MESSAGE;
}

function normalizeErrorMessage(
  message: string,
  fallback = DEFAULT_ERROR_MESSAGE,
  status?: number,
): string {
  const text = message.trim();
  const lower = text.toLowerCase();

  if (!text) return fallback;

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("fetch failed") ||
    lower.includes("load failed") ||
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("enotfound") ||
    lower.includes("cors")
  ) {
    return NETWORK_ERROR_MESSAGE;
  }

  if (
    lower === "bad request" ||
    lower === "unauthorized" ||
    lower === "forbidden" ||
    lower === "not found" ||
    lower === "too many requests" ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("invalid token") ||
    lower.includes("jwt") ||
    lower.includes("request failed with status code")
  ) {
    return status ? getStatusErrorMessage(status) : fallback;
  }

  if (/^http\s+\d{3}$/i.test(text)) {
    const parsedStatus = Number(text.replace(/\D/g, ""));
    return getStatusErrorMessage(parsedStatus);
  }

  if (
    lower.includes("smtp") ||
    lower.includes("resend") ||
    lower.includes("nodemailer") ||
    lower.includes("email_provider") ||
    lower.includes("email_from_address") ||
    lower.includes("gmail")
  ) {
    return "Не вдалося надіслати лист. Спробуйте ще раз трохи пізніше.";
  }

  if (
    lower.includes("internal server error") ||
    lower.includes("unexpected token") ||
    lower.includes("syntaxerror") ||
    lower.includes("json")
  ) {
    return SERVER_ERROR_MESSAGE;
  }

  if (status && status >= 500 && text === fallback) return SERVER_ERROR_MESSAGE;

  return text;
}

function getErrorStatus(error: unknown): number | undefined {
  if (error instanceof Error && "status" in error) {
    const status = (error as Error & { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

export function getFriendlyErrorMessage(
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE,
): string {
  const status = getErrorStatus(error);
  if (error instanceof Error) {
    return normalizeErrorMessage(error.message, fallback, status);
  }
  if (typeof error === "string") {
    return normalizeErrorMessage(error, fallback, status);
  }
  return fallback;
}

async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    throw new Error(getFriendlyErrorMessage(error, NETWORK_ERROR_MESSAGE));
  }
}

async function getResponseErrorMessage(res: Response): Promise<string> {
  let msg = getStatusErrorMessage(res.status);
  try {
    const data = await res.json();
    if (data?.error) {
      msg = normalizeErrorMessage(String(data.error), msg, res.status);
    }
  } catch {
    /* ignore */
  }
  return msg;
}

async function throwResponseError(res: Response): Promise<never> {
  const error = new Error(await getResponseErrorMessage(res)) as Error & {
    status: number;
  };
  error.status = res.status;
  throw error;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    await throwResponseError(res);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * 🔌 ENDPOINT: POST /api/auth/login
 * Request:  { email: string, password: string }
 * Response: { token: string, user: UserInfo }
 * Errors:   401 → "Невірний email або пароль"
 */
export async function apiLogin(
  email: string,
  password: string,
): Promise<AuthPayload> {
  const res = await apiFetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse<AuthPayload>(res);
}

/**
 * 🔌 ENDPOINT: POST /api/auth/register
 * Request:  { email, password, name, deviceId? }
 * Response: { requires_verification: true, pendingRegistrationId: number }
 * Errors:   409 → "Email вже існує", 400 → "Невірні дані"
 */
export async function apiRegister(
  email: string,
  password: string,
  name: string,
  deviceId?: string,
): Promise<{ requires_verification: true; pendingRegistrationId: number }> {
  const res = await apiFetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, deviceId }),
  });
  return handleResponse<{
    requires_verification: true;
    pendingRegistrationId: number;
  }>(res);
}

/**
 * 🔌 ENDPOINT: POST /api/auth/register/verify
 * Request:  { pendingRegistrationId: number, code: string, deviceId: string }
 * Response: { token: string, user: UserInfo }
 * Errors:   400 → "Невірний код", 410 → "Код прострочений", 429 → rate-limit
 */
export async function apiVerifyRegistration(
  pendingRegistrationId: number,
  code: string,
  deviceId: string,
): Promise<AuthPayload> {
  const res = await apiFetch(`${BASE}/api/auth/register/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingRegistrationId, code, deviceId }),
  });
  return handleResponse<AuthPayload>(res);
}

/**
 * 🔌 ENDPOINT: POST /api/auth/register/resend
 * Request:  { pendingRegistrationId: number }
 * Response: { ok: true }
 * Errors:   410 → "Сесія реєстрації закінчилась"
 */
export async function apiResendRegistrationCode(
  pendingRegistrationId: number,
): Promise<void> {
  const res = await apiFetch(`${BASE}/api/auth/register/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingRegistrationId }),
  });
  await handleResponse<{ ok: true }>(res);
}

/**
 * 🔌 ENDPOINT: POST /api/auth/google
 * Request:  { email: string, name?: string, image?: string }
 * Response: { token: string, user: UserInfo }
 * Логіка:   якщо юзер з таким email існує → логін, інакше → реєстрація
 */
export async function apiGoogleLogin(
  googleIdToken: string,
): Promise<AuthPayload> {
  const res = await apiFetch(`${BASE}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: googleIdToken }),
  });
  return handleResponse<AuthPayload>(res);
}

/**
 * 🔌 ENDPOINT: GET /api/auth/me  [AUTH REQUIRED]
 * Headers:  Authorization: Bearer <token>
 * Response: UserInfo
 * Помилки:  401 → "Unauthorized"
 * Де використовується: app/admin/page.tsx для перевірки прав адміна
 */
export async function apiGetMe(token: string): Promise<UserInfo> {
  const res = await apiFetch(`${BASE}/api/auth/me`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return handleResponse<UserInfo>(res);
}

/**
 * 🔌 ENDPOINT: PUT /api/auth/profile  [AUTH REQUIRED]
 * Request:  Partial<UserInfo> (тільки name, address, email — НЕ phone!)
 * Response: UserInfo (оновлений)
 * ⚠️ НЕ приймати поле `phone` — телефон оновлюється через /api/auth/phone/verify-otp
 */
export async function apiUpdateProfile(
  data: Partial<UserInfo>,
  token: string,
): Promise<UserInfo> {
  const res = await apiFetch(`${BASE}/api/auth/profile`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<UserInfo>(res);
}

/**
 * 🔌 ENDPOINT: PUT /api/auth/password  [AUTH REQUIRED]
 * Request:  { oldPassword: string, newPassword: string }
 * Response: 204 No Content
 * Errors:   400 → "Старий пароль невірний", 401 → "Unauthorized"
 */
export async function apiChangePassword(
  oldPassword: string,
  newPassword: string,
  token: string,
): Promise<void> {
  const res = await apiFetch(`${BASE}/api/auth/password`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  if (!res.ok) await throwResponseError(res);
}

/**
 * 🔌 ENDPOINT: POST /api/auth/reset-password
 * Request:  { email: string }
 * Response: { ok: true }  або ігнорує якщо email не існує (безпека)
 * Дія:      відправити email з посиланням або кодом для скидання пароля
 * ⚠️ Завжди повертати 200 навіть якщо email не знайдено (не розкривати бд)
 * ENV:      EMAIL_PROVIDER_API_KEY (SendGrid / Resend / Mailgun)
 */
export async function apiForgotPassword(email: string): Promise<void> {
  const res = await apiFetch(`${BASE}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) await throwResponseError(res);
}

/**
 * 🔌 ENDPOINT: POST /api/auth/reset-password/confirm
 * Request:  { token: string, newPassword: string }
 * Response: { ok: true }
 * Errors:   400 → "Недійсний або прострочений токен"
 */
export async function apiConfirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<void> {
  const res = await apiFetch(`${BASE}/api/auth/reset-password/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
  await handleResponse<{ ok: true }>(res);
}

/**
 * 🔌 ENDPOINT: PUT /api/auth/payment  [AUTH REQUIRED]
 * Request:  { payment: string }
 * Response: UserInfo (оновлений)
 * ⚠️ НЕ приймати card_masked_pan / card_type напряму — тільки через WayForPay callback
 */
export async function apiUpdatePayment(
  payment: string,
  token: string,
): Promise<UserInfo> {
  const res = await apiFetch(`${BASE}/api/auth/payment`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ payment }),
  });
  return handleResponse<UserInfo>(res);
}

// ─── Телефон — OTP верифікація ────────────────────────────────────────────────

/**
 * 🔌 ENDPOINT: POST /api/auth/phone/send-otp  [AUTH REQUIRED]
 * Request:  { phone: string }  формат: "+380XXXXXXXXX"
 * Response: { success: true, expiresIn: 300 }
 * Errors:   400 → "Невірний формат", 429 → rate-limit (3 запити / 10 хв)
 *
 * ⚙️ Що має зробити бекенд:
 * 1. Згенерувати 6-значний код
 * 2. Зберегти в БД: { userId, phone, code, expiresAt: now+5хв }
 * 3. Відправити через TurboSMS API:
 *    POST https://api.turbosms.ua/message/send
 *    Headers: { Authorization: "Bearer ${TURBOSMS_TOKEN}" }
 *    Body: { recipients: [phone], sms: { sender: TURBOSMS_SENDER, text: "Код: ${code}" } }
 * 4. Rate-limit: не більше 3 запитів за 10 хвилин на один телефон
 * ENV: TURBOSMS_TOKEN, TURBOSMS_SENDER
 */
export async function apiSendPhoneOtp(
  phone: string,
  token: string,
): Promise<void> {
  const res = await apiFetch(`${BASE}/api/auth/phone/send-otp`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) await throwResponseError(res);
}

/**
 * 🔌 ENDPOINT: POST /api/auth/phone/verify-otp  [AUTH REQUIRED]
 * Request:  { phone: string, code: string }
 * Response: UserInfo (з оновленим phone + phone_verified: true)
 * Errors:   400 → "Невірний або застарілий код", 429 → заблокований (5+ спроб)
 *
 * ⚙️ Що має зробити бекенд:
 * 1. Знайти OTP запис в БД по userId + phone
 * 2. Перевірити code та expiresAt (використовувати crypto.timingSafeEqual!)
 * 3. Лічильник спроб: якщо > 5 → заблокувати на 30 хв
 * 4. Видалити OTP запис (one-time use)
 * 5. UPDATE users SET phone = $1, phone_verified = true WHERE id = $2
 */
export async function apiVerifyPhoneOtp(
  phone: string,
  code: string,
  token: string,
): Promise<UserInfo> {
  const res = await apiFetch(`${BASE}/api/auth/phone/verify-otp`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ phone, code }),
  });
  return handleResponse<UserInfo>(res);
}

// ─── WayForPay ────────────────────────────────────────────────────────────────

/**
 * 🔌 ENDPOINT: POST /api/payment/wayforpay/init  [AUTH REQUIRED]
 * Response: WayForPayInitResult
 *   - { mock: true }  → бекенд ще не підключений (фронтенд показує тест-форму)
 *   - { wayforpay: { ... підписані параметри ... } }  → продакшн
 *
 * ⚙️ Що має зробити бекенд:
 * 1. Згенерувати унікальний orderReference (UUID або timestamp+userId)
 * 2. Сформувати об'єкт запиту WayForPay (сума: 1 UAH для збереження картки)
 * 3. Підписати HMAC-MD5 з WAYFORPAY_SECRET_KEY (ТІЛЬКИ на бекенді!)
 * 4. Повернути підписані поля для JS-форми
 * ENV: WAYFORPAY_MERCHANT_ACCOUNT, WAYFORPAY_SECRET_KEY, WAYFORPAY_DOMAIN
 *
 * 🔌 WEBHOOK: POST /api/payment/wayforpay/callback  (від WayForPay → бекенд)
 * Після успіху WayForPay надішле callback з recToken + card_masked_pan + card_type
 * Бекенд має оновити: UPDATE users SET card_masked_pan, card_type WHERE id = userId
 * ⚠️ НЕ приймати card_masked_pan від фронтенду — тільки з верифікованого callback!
 */
export async function apiInitWayForPay(
  token: string,
): Promise<WayForPayInitResult> {
  const res = await apiFetch(`${BASE}/api/payment/wayforpay/init`, {
    method: "POST",
    // Fastify вимагає Content-Type щоб парсити body, навіть якщо воно пусте
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return handleResponse<WayForPayInitResult>(res);
}

// ─── Email change ─────────────────────────────────────────────────────────────

/**
 * 🔌 ENDPOINT: POST /api/auth/change-email/request  [AUTH REQUIRED]
 * Request:  { newEmail: string }
 * Response: { ok: true }
 * Errors:   400 → "Email вже використовується"
 *
 * ⚙️ Бекенд: перевірити унікальність, зберегти код в pending_email_changes (TTL 10хв),
 *   відправити email з кодом (SendGrid / Resend / Mailgun)
 * ENV: EMAIL_PROVIDER_API_KEY, EMAIL_FROM_ADDRESS
 */
export async function apiRequestEmailChange(
  newEmail: string,
  token: string,
): Promise<void> {
  const res = await apiFetch(`${BASE}/api/auth/change-email/request`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ newEmail }),
  });
  if (!res.ok) await throwResponseError(res);
}

/**
 * 🔌 ENDPOINT: POST /api/auth/change-email/confirm  [AUTH REQUIRED]
 * Request:  { newEmail: string, code: string }
 * Response: UserInfo (з оновленим email)
 * Errors:   400 → "Код застарів", "Невірний код", "Немає активного запиту"
 *
 * ⚙️ Бекенд: знайти запис в pending_email_changes, перевірити TTL + код,
 *   UPDATE users SET email, DELETE FROM pending_email_changes
 */
export async function apiConfirmEmailChange(
  newEmail: string,
  code: string,
  token: string,
): Promise<UserInfo> {
  const res = await apiFetch(`${BASE}/api/auth/change-email/confirm`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ newEmail, code }),
  });
  return handleResponse<UserInfo>(res);
}

// ─── Products ─────────────────────────────────────────────────────────────────

/**
 * 🔌 ENDPOINT: GET /api/products
 * Query:    ?category=Напої  (опціонально)
 *           ?hidden=false    (за замовчуванням — приховані не повертаються)
 * Response: Product[]
 * Cache:    revalidate кожні 60 секунд (next: { revalidate: 60 })
 */
export async function apiGetProducts(category?: string): Promise<Product[]> {
  const url = new URL(`${BASE}/api/products`);
  if (category) url.searchParams.set("category", category);

  const res = await apiFetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  return handleResponse<Product[]>(res);
}

/**
 * 🔌 ENDPOINT: GET /api/products/:id
 * Response: Product
 * Errors:   404 → "Not found"
 */
export async function apiGetProduct(id: number): Promise<Product> {
  const res = await apiFetch(`${BASE}/api/products/${id}`);
  return handleResponse<Product>(res);
}

/**
 * 🔌 ENDPOINT: GET /api/categories
 * Response: string[]  наприклад ["Напої", "Їжа", "Комбо", "Магазин"]
 * Cache:    revalidate кожні 5 хвилин (рідко змінюється)
 * ⚙️ Бекенд: SELECT DISTINCT category FROM products WHERE hidden = false
 */
export async function apiGetCategories(): Promise<string[]> {
  const res = await apiFetch(`${BASE}/api/categories`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  } as RequestInit);
  return handleResponse<string[]>(res);
}

/**
 * 🔌 ENDPOINT: POST /api/products  [ADMIN ONLY]
 * Headers:  Authorization: Bearer <admin_token>
 * Request:  { name, description?, weight?, price, category?, imageUrl?, imageName? }
 * Response: Product (новостворений, status 201)
 * Errors:   401 → "Unauthorized"
 */
export async function apiCreateProduct(
  data: Omit<Product, "id">,
  token: string,
): Promise<Product> {
  const res = await apiFetch(`${BASE}/api/products`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<Product>(res);
}

/**
 * 🔌 ENDPOINT: PUT /api/products/:id  [ADMIN ONLY]
 * Request:  Повний об'єкт Product (всі поля)
 * Response: Product (оновлений)
 */
export async function apiUpdateProduct(
  id: number,
  data: Partial<Product>,
  token: string,
): Promise<Product> {
  const res = await apiFetch(`${BASE}/api/products/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  return handleResponse<Product>(res);
}

/**
 * 🔌 ENDPOINT: DELETE /api/products/:id  [ADMIN ONLY]
 * Response: 204 No Content
 * ⚠️ Краще використовувати PATCH з { hidden: true } для soft delete
 *   (збереже дані в замовленнях)
 */
export async function apiDeleteProduct(
  id: number,
  token: string,
): Promise<void> {
  const res = await apiFetch(`${BASE}/api/products/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await throwResponseError(res);
}

/**
 * 🔌 ENDPOINT: PATCH /api/products/:id  [ADMIN ONLY]
 * Request:  { hidden: boolean }
 * Response: Product (оновлений)
 * Використання: показати/приховати товар без видалення
 */
export async function apiToggleProductVisibility(
  id: number,
  hidden: boolean,
  token: string,
): Promise<Product> {
  const res = await apiFetch(`${BASE}/api/products/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ hidden }),
  });
  return handleResponse<Product>(res);
}

// ─── Зміна пароля з OTP ───────────────────────────────────────────────────────

/**
 * 🔌 ENDPOINT: POST /api/auth/password-change/request  [AUTH REQUIRED]
 * Request:  { oldPassword: string, newPassword: string }
 * Response: { ok: true }
 * Errors:   400 → "Невірний поточний пароль", 429 → rate-limit
 *
 * ⚙️ Бекенд:
 * 1. bcrypt.compare(oldPassword, hash) — якщо невірний → 400
 * 2. Зберегти bcrypt(newPassword) в pending_password_changes { userId, newHash, expiresAt: now+5хв }
 * 3. Згенерувати 6-значний OTP, зберегти в БД (TTL 2хв)
 * 4. Відправити SMS через TurboSMS
 * ENV: TURBOSMS_TOKEN, TURBOSMS_SENDER
 */
export async function apiRequestPasswordChange(
  oldPassword: string,
  newPassword: string,
  token: string,
): Promise<void> {
  const res = await apiFetch(`${BASE}/api/auth/password-change/request`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  if (!res.ok) await throwResponseError(res);
}

/**
 * 🔌 ENDPOINT: POST /api/auth/password-change/confirm  [AUTH REQUIRED]
 * Request:  { code: string }
 * Response: 204 No Content
 * Errors:
 *   400 → "Невірний або застарілий код"
 *   410 → "Сесія закінчилась — почніть знову"
 *   429 → "Занадто багато спроб (5 невірних → блокування 30хв)"
 *
 * ⚙️ Бекенд:
 * 1. Знайти pending запис по userId (перевірити TTL)
 * 2. crypto.timingSafeEqual + expiresAt
 * 3. UPDATE users SET password_hash = pendingHash WHERE id = userId
 * 4. Видалити pending запис + OTP
 */
export async function apiConfirmPasswordChange(
  code: string,
  token: string,
): Promise<void> {
  const res = await apiFetch(`${BASE}/api/auth/password-change/confirm`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const msg = await getResponseErrorMessage(res);
    const err = Object.assign(new Error(msg), { status: res.status });
    throw err;
  }
}

/**
 * 🔌 ENDPOINT: POST /api/auth/verify-password  [AUTH REQUIRED]
 * Request:  { password: string }
 * Response: { ok: true }
 * Errors:   400 → "Невірний пароль"
 *
 * ⚙️ Бекенд: bcrypt.compare(password, hash) — тільки перевірка, без змін
 */
export async function apiVerifyPassword(
  password: string,
  token: string,
): Promise<void> {
  const res = await apiFetch(`${BASE}/api/auth/verify-password`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ password }),
  });
  if (!res.ok) await throwResponseError(res);
}

// ─── Orders ───────────────────────────────────────────────────────────────────

/**
 * 🔌 ENDPOINT: POST /api/orders  [AUTH REQUIRED]
 * Request:  { items: [{ productId: number, quantity: number }] }
 * Response: Order (новостворений, status 201)
 * Errors:   400 → "Замовлення порожнє", 401 → "Unauthorized"
 *
 * ⚙️ Бекенд: валідувати productId, взяти актуальні ціни з БД,
 *   розрахувати total, INSERT INTO orders + order_items
 *   Надіслати email-підтвердження користувачу
 */
export async function apiCreateOrder(
  items: OrderItem[],
  token: string,
): Promise<unknown> {
  const res = await apiFetch(`${BASE}/api/orders`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ items }),
  });
  return handleResponse(res);
}

/**
 * 🔌 ENDPOINT: GET /api/orders  [AUTH REQUIRED]
 * Response: Order[]  (тільки замовлення поточного юзера, сортування — новіші спочатку)
 * Errors:   401 → "Unauthorized"
 */
export async function apiGetMyOrders(token: string): Promise<Order[]> {
  const res = await apiFetch(`${BASE}/api/orders`, {
    headers: authHeaders(token),
  });
  return handleResponse<Order[]>(res);
}

// ─── Admin: Orders ────────────────────────────────────────────────────────────

/**
 * 🔌 ENDPOINT: GET /api/orders/admin  [ADMIN ONLY]
 * Response: AdminOrder[]  — всі замовлення з даними юзерів, новіші спочатку
 * Errors:   401 → "Unauthorized", 403 → "Forbidden"
 */
export async function apiGetAdminOrders(token: string): Promise<unknown[]> {
  const res = await apiFetch(`${BASE}/api/orders/admin`, {
    headers: authHeaders(token),
  });
  return handleResponse<unknown[]>(res);
}

/**
 * 🔌 ENDPOINT: PATCH /api/orders/:id  [ADMIN ONLY]
 * Request:  { status: string }
 * Response: оновлене замовлення
 * Errors:   404 → "Not found", 400 → "Невалідний статус"
 */
export async function apiUpdateOrderStatus(
  id: number,
  status: string,
  token: string,
): Promise<unknown> {
  const res = await apiFetch(`${BASE}/api/orders/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  });
  return handleResponse<unknown>(res);
}
