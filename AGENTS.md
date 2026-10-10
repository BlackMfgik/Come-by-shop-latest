# Come by Shop — AI Agent Context

> Ukrainian-language food e-commerce. Monorepo: `frontend/` (Next.js) + `backend/` (Fastify).
> Status: **near-complete — bug fixes and polish only**.
> UI language and error messages: **Ukrainian**. Currency: hryvnia (₴).

---

## 1. Tech Stack

### Frontend (`frontend/`)

| Layer        | Technology                                   |
| ------------ | -------------------------------------------- |
| Framework    | Next.js 16 (App Router, React 19)            |
| Language     | TypeScript 5.7 strict                        |
| State        | Zustand 5 with persist middleware            |
| Data / cache | TanStack Query 5                             |
| Forms        | React Hook Form 7 + Zod 3                    |
| Auth         | NextAuth v5 beta (`next-auth@5.0.0-beta.32`) |
| Images       | Cloudinary (next-cloudinary + CldImage)      |
| Icons        | lucide-react                                 |
| Toasts       | sonner                                       |
| Payments     | WayForPay (widget script)                    |
| Fingerprint  | @fingerprintjs/fingerprintjs                 |
| Tests        | Vitest + @testing-library/react              |
| CSS          | **Custom CSS variables — NOT Tailwind**      |

### Backend (`backend/`)

| Layer        | Technology                    |
| ------------ | ----------------------------- |
| Framework    | Fastify 5                     |
| ORM          | Drizzle ORM 0.45              |
| Database     | PostgreSQL (Neon, serverless) |
| Auth         | @fastify/jwt (Bearer tokens)  |
| Validation   | Zod 3                         |
| Email        | Resend                        |
| SMS          | TurboSMS                      |
| Payments     | WayForPay (server-side logic) |
| Google OAuth | google-auth-library (verifies ID token) |
| Env          | @t3-oss/env-core              |
| Tests        | Vitest                        |

---

## 2. Project Structure

```
monorepo/
├── AGENTS.md
├── shared/
│   └── types/index.ts        ← shared types between frontend and backend
├── frontend/                 ← Next.js 16 App Router
│   ├── app/
│   │   ├── layout.tsx        ← root layout, Providers, WayForPay script
│   │   ├── globals.css       ← ALL styles and theme CSS variables
│   │   ├── page.tsx, menu/, shop/, combo/, account/,
│   │   │   login/, registration/, admin/, about-us/
│   │   ├── api/upload/       ← Next.js Route Handler for Cloudinary upload
│   │   └── robots.ts, sitemap.ts
│   ├── components/
│   │   ├── AdminPanel.tsx         ← ~53KB, large component
│   │   ├── ProductCatalog.tsx     ← ~37KB, large component
│   │   ├── Header.tsx, Footer.tsx, CartSidebar.tsx
│   │   ├── modals/                ← BaseModal + specific modals
│   │   └── ui/                    ← reusable UI primitives
│   ├── store/                ← Zustand stores
│   ├── lib/
│   │   ├── api.ts            ← ALL backend fetch calls (single entry point)
│   │   └── schemas.ts        ← Zod validation schemas
│   ├── types/index.ts        ← TypeScript interfaces
│   ├── hooks/useFingerprint.ts
│   └── auth.ts               ← NextAuth config (Credentials + Google)
└── backend/
    ├── src/
    │   ├── app.ts            ← Fastify bootstrap (cors, helmet, jwt, rate-limit)
    │   ├── db/schema.ts      ← Drizzle schema (source of truth for DB types)
    │   ├── routes/           ← auth, products, orders, payment
    │   ├── services/         ← email, payment, sms
    │   └── middleware/       ← requireAuth, requireAdmin
    └── drizzle/              ← SQL migrations
```

---

## 3. TypeScript Types

**Location:** `frontend/types/index.ts` (mirrored in `shared/types/index.ts`)

```typescript
interface UserInfo {
  id: number;
  email: string;
  name?: string;
  phone?: string;
  phone_verified?: boolean;
  address?: string;
  card_masked_pan?: string;    // "**** **** **** 5353"
  card_type?: string;          // "Visa" | "MasterCard" | "Maestro"
  has_password?: boolean;      // false = OAuth-only account (frontend only)
  admin: boolean;
  /** @deprecated use card_masked_pan + card_type */
  payment?: string;
}

interface AuthPayload { token: string; user: UserInfo; }

interface Product {
  id: number; name: string; description?: string;
  weight?: string; price: number; image?: string;
  imageName?: string; category?: string; hidden?: boolean;
}

interface CartItem {
  id: number | null; name: string; price: number;
  image: string; description: string; quantity: number;
}

interface Order {
  id: number; createdAt: string; status: string; total: number;
  items: Array<{ productId: number; productName: string; quantity: number; price: number }>;
}

// WayForPay init response — two possible shapes
type WayForPayInitResult =
  | { mock: true }                                   // local dev only
  | { mock?: false; verify: { url: string; fields: Record<string, string | number> } }
```

> ⚠️ `merchantSignature` (HMAC-MD5) is **backend-only** — never compute on the frontend.
> Card binding = WayForPay Card Verify: the browser POSTs `verify.fields` to `verify.url`, no money is charged.

---

## 4. CSS System — CRITICAL

The project uses **CSS custom properties exclusively**. Never hardcode colors.

### Theme switching

- Controlled by `data-theme` attribute on `<html>`
- Default: `dark`
- Values: `"dark"` | `"light"`

### All variables

```css
/* Backgrounds */   --bg, --bg-2, --surface, --surface-2, --surface-3
/* Text */          --text, --text-2, --text-3
/* Accent */        --accent (basil green, actions), --accent-dim, --accent-ink (text on accent),
                    --accent-glow, --accent-glow-strong
/* Price */         --price (apricot) — prices and totals only
/* Borders */       --border, --border-2
/* Danger */        --red, --red-glow
/* Specific */      --header-bg, --nav-mobile-bg
                    --icon-filter, --icon-active-filter, --logo-filter, --cart-shadow
```

### Fonts

- **Unbounded** — headings, prices, logo text → `var(--font-display)`.
- **Manrope** — body text, buttons, forms → `var(--font-body)`.
- Loaded with `next/font/google` in `app/layout.tsx` with `subsets: ["latin", "cyrillic", "cyrillic-ext"]`
  (self-hosted at build time, no request to Google at runtime).
- Any new font **must** include the `cyrillic` and `cyrillic-ext` subsets (ї, є, ґ). The old Syne / DM Sans
  had no Cyrillic, so Ukrainian text silently fell back to system fonts.

---

## 5. State Management

| Store               | Holds                                            | localStorage key |
| ------------------- | ------------------------------------------------ | ---------------- |
| `authStore`         | `token` (JWT), `user` (UserInfo), `_hasHydrated` | `auth-storage`   |
| `cartStore`         | `items[]`, `total` (recomputed on rehydrate)     | `cart-storage`   |
| `themeStore`        | `theme: "dark" \| "light"`                       | `theme-storage`  |
| `verificationStore` | OTP state during phone verification              | —                |

```typescript
// ✅ Only in 'use client' components
const { token, user } = useAuthStore()

// ✅ Always check hydration before rendering auth-dependent UI
const { _hasHydrated, user } = useAuthStore()
if (!_hasHydrated) return <Skeleton />

// ❌ Never use in Server Components — breaks SSR
```

---

## 6. API — Full Endpoint Reference

Base URL: `process.env.NEXT_PUBLIC_API_URL` (no trailing slash)
All calls go through `frontend/lib/api.ts` — never fetch directly in components.
Error shape: `{ "error": "Ukrainian message" }`
Auth header: `Authorization: Bearer <token>`

### `/api/auth`

| Method | Path                       | Auth | Description                                          |
| ------ | -------------------------- | ---- | ---------------------------------------------------- |
| POST   | `/register`                | —    | Register → `{ requires_verification: true, userId }` |
| POST   | `/register/verify`         | —    | Confirm email with 6-digit code                      |
| POST   | `/register/resend`         | —    | Resend verification code                             |
| POST   | `/login`                   | —    | Login → `{ token, user }`                            |
| POST   | `/2fa/send`                | —    | Send 2FA code to email                               |
| POST   | `/2fa/verify`              | —    | Verify 2FA → `{ token, user }`                       |
| POST   | `/google`                  | —    | `{ idToken }` (Google ID token) → `{ token, user }`  |
| GET    | `/me`                      | ✅   | Current user → `UserInfo`                            |
| PUT    | `/profile`                 | ✅   | Update name / address                                |
| PUT    | `/password`                | ✅   | Change password (old + new)                          |
| POST   | `/reset-password`          | —    | Request password reset (sends email)                 |
| POST   | `/reset-password/confirm`  | —    | Confirm reset with token                             |
| POST   | `/phone/send-otp`          | ✅   | Send SMS OTP for phone verification                  |
| POST   | `/phone/verify-otp`        | ✅   | Confirm OTP → `phoneVerified: true`                  |
| POST   | `/change-email/request`    | ✅   | Request email change                                 |
| POST   | `/change-email/confirm`    | ✅   | Confirm change with code                             |
| POST   | `/password-change/request` | ✅   | Verify current password before change                |
| POST   | `/password-change/confirm` | ✅   | Confirm new password with code                       |
| POST   | `/verify-password`         | ✅   | Check password (used by ConfirmPasswordModal)        |

### `/api/products`

| Method | Path          | Auth     | Description                           |
| ------ | ------------- | -------- | ------------------------------------- |
| GET    | `/`           | —        | Visible products (admin token → all)  |
| GET    | `/:id`        | —        | Single product                        |
| GET    | `/categories` | —        | List of categories                    |
| POST   | `/`           | 🔐 admin | Create product                        |
| PUT    | `/:id`        | 🔐 admin | Replace product                       |
| PATCH  | `/:id`        | 🔐 admin | Partial update (e.g. toggle `hidden`) |
| DELETE | `/:id`        | 🔐 admin | Delete product                        |

### `/api/orders`

| Method | Path     | Auth     | Description                         |
| ------ | -------- | -------- | ----------------------------------- |
| GET    | `/`      | ✅       | Current user's orders               |
| POST   | `/`      | ✅       | Create order                        |
| GET    | `/admin` | 🔐 admin | All orders with customer contacts   |
| PATCH  | `/:id`   | 🔐 admin | Change order status `{ status }`    |

### `/api/payment`

| Method | Path                  | Auth | Description                       |
| ------ | --------------------- | ---- | --------------------------------- |
| POST   | `/wayforpay/init`     | ✅   | `{}` → signed Card Verify form `{ verify: { url, fields } }`; `{ orderId }` → invoice `{ url }` |
| POST   | `/wayforpay/callback` | —    | WayForPay webhook (HMAC-verified): `VERIFY-*` saves masked card, `ORDER-*` marks order paid |
| GET/POST | `/wayforpay/return` | —    | WayForPay returnUrl → 303 to `/account?card=pending` or `?tab=orders` |
| POST   | `/dev/card`           | ✅   | DEV ONLY (DEV_OTP set, not production): save a test card mask |

### Next.js API Routes

| Method | Path          | Description                |
| ------ | ------------- | -------------------------- |
| POST   | `/api/upload` | Upload image to Cloudinary (admin Bearer token required) |

---

## 7. Cloudinary Upload Flow

```
User selects file
      ↓
AdminPanel.tsx → builds FormData with the file
      ↓
POST /api/upload  (Next.js Route Handler — server-side)
      ↓
app/api/upload/route.ts:
  ├── validate: file.type must start with "image/"
  ├── validate: file.size ≤ 10MB
  └── cloudinary.uploader.upload_stream()
        folder: "come-by-shop/products"
        transformations: quality:auto, fetch_format:auto, 800×800 crop:limit
      ↓
Response: { url: "https://res.cloudinary.com/dk9yjgta3/..." }
      ↓
Save url as product.image
```

```typescript
// Upload
const formData = new FormData()
formData.append("file", file)
const { url } = await fetch("/api/upload", { method: "POST", body: formData }).then(r => r.json())

// Display
import { CldImage } from "next-cloudinary"
<CldImage src={product.image} width={400} height={400} alt={product.name} />
```

---

## 8. Modal Component Architecture

```
BaseModal.tsx                     ← base wrapper (overlay + close button)
  props: onClose, disableOutsideClick?, maxWidth? (default: 420)
  Overlay close: fires only when mousedown AND mouseup both land on the overlay
                 (prevents accidental close when user drags text selection)
  Close button: always visible, type="button"
  Accessibility: role="dialog", aria-modal, aria-labelledby

Modals built on BaseModal:
├── AddressAutocomplete.tsx       ← Google Places autocomplete
├── ChangeEmailModal.tsx          ← 2-step flow: request → confirm with code
├── ChangePasswordModal.tsx       ← verify current password + set new one
├── ConfirmDeleteModal.tsx        ← "Are you sure?" with two buttons
├── ConfirmPasswordModal.tsx      ← password gate before destructive actions
├── ForgotPasswordModal.tsx       ← password reset via email
├── IncompleteProfileModal.tsx    ← nudge to complete profile
├── LoginRequiredModal.tsx        ← redirect to login prompt
├── OrderDetailsModal.tsx         ← order line items + status
├── OrderSuccessModal.tsx         ← post-order confirmation
├── PaymentCardModal.tsx          ← card binding via WayForPay
├── PhoneVerifyModal.tsx          ← SMS OTP verification flow
├── ProductQuickViewModal.tsx     ← product details + add to cart
└── TwoFactorModal.tsx            ← 2FA during login
```

**Rule for new modals — always wrap with BaseModal:**

```typescript
export default function NewModal({ onClose }: { onClose: () => void }) {
  return (
    <BaseModal onClose={onClose} maxWidth={480}>
      <h2 id="modal-title">Title</h2>
      {/* content */}
    </BaseModal>
  )
}
```

---

## 9. Database Schema

```
users
  id (PK), email (unique), password_hash (nullable = OAuth user)
  name, phone, phone_verified, address
  card_masked_pan, card_type    ← populated by WayForPay callback
  admin (bool, default false)
  created_at, updated_at
  → has many: user_devices, orders

user_devices
  id, user_id → users(cascade), device_id
  unique(user_id, device_id)

two_factor_codes                ← 2FA on login from new device
  id, user_id (unique), device_id, code(6), expires_at, attempts

phone_otps                      ← SMS OTP for phone verification
  id, user_id (unique), phone, code(6), expires_at, attempts, blocked_until

pending_email_changes           ← in-progress email change
  id, user_id (unique), new_email, code(6), expires_at

password_reset_tokens
  id, user_id, token(128, unique), expires_at, used (bool)

products
  id, name, description, weight
  price (decimal 10,2)
  image (Cloudinary URL), category
  hidden (bool, default false)
  created_at

orders
  id, user_id → users(restrict)
  status (default "В обробці")
  total (decimal 10,2)
  created_at
  → has many: order_items

order_items
  id, order_id → orders(cascade)
  product_id → products(set null on delete)
  product_name  ← SNAPSHOT — copy at order time, not a join
  quantity
  price         ← SNAPSHOT — copy at order time, not a join
```

> `product_name` and `price` in `order_items` are **snapshots** — use them directly, never join to `products` for display.

---

## 10. Coding Rules

### ✅ DO

```typescript
// Use Drizzle inferred types on the backend
export type User = typeof users.$inferSelect

// Always use CSS variables — never hardcode colors
color: var(--text);
background: var(--surface);
border: 1px solid var(--border);

// Add new API calls as functions in lib/api.ts with JSDoc
/**
 * 🔌 ENDPOINT: POST /api/orders
 * Request:  { items: CartItem[], address: string }
 * Response: { orderId: number }
 * Errors:   400 → "Невалідні дані", 401 → unauthorized
 */
export async function apiCreateOrder(...) {}

// Use named exports for components
export function ProductCard({ ... }: Props) {}

// SSR data fetching with revalidation
const data = await fetch(url, { next: { revalidate: 60 } })

// Backend errors in Ukrainian
return reply.status(400).send({ error: "Невалідні дані" })
```

### ❌ DON'T

```typescript
// ❌ Hardcode colors
color: "#93cf6b"; // → var(--accent)
background: "#1f1a16"; // → var(--surface)
// Tints of the accent: color-mix(in srgb, var(--accent) 12%, transparent)

// ❌ Use React Context for global state → use Zustand

// ❌ Fetch directly in components → use lib/api.ts

// ❌ Add new dependencies without asking first

// ❌ Leave console.log in production code

// ❌ Use `as any` without an explanatory comment

// ❌ Rename searchStore.ts.ts — double extension is intentional

// ❌ Use <form> HTML tag in React artifacts
//    → use React Hook Form handleSubmit instead

// ❌ Use fonts without Cyrillic, or load them via @import in CSS
```

---

## 11. Testing Rules (Vitest)

### Backend

```typescript
// Always mock env BEFORE importing app modules
vi.mock("../src/env.js", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost/test",
    JWT_SECRET: "test-secret-key-that-is-at-least-32-chars",
    // ... all required fields
  },
}));

// Mock the entire db object
vi.mock("../src/db/index.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}));

// Mock all external services (SMS, Email, etc.)
vi.mock("../src/services/sms.js", () => ({
  sendSms: vi.fn().mockResolvedValue(undefined),
  generateOtp: vi.fn().mockReturnValue("123456"),
}));
```

### Frontend

```typescript
// Reset store before each test
beforeEach(() => {
  useAuthStore.getState().logout();
});

// Critical security scenarios to always test:
// 1. logout clears BOTH token AND user (not just one)
// 2. updateUser does NOT touch token
// 3. Initial state: token=null, user=null
// 4. saveAuth stores both token and user
```

### Commands

```bash
cd frontend && npm run test       # watch mode
cd frontend && npm run test:run   # single run
cd frontend && npm run lint       # ESLint flat config (eslint.config.mjs)

cd backend && npm run test
cd backend && npm run test:watch
```

---

## 12. Known Quirks & Gotchas

| #   | Issue                                   | Action                                              |
| --- | --------------------------------------- | --------------------------------------------------- |
| 1   | `suppressHydrationWarning` on `<body>`  | Keep it — intentional, caused by browser extensions |
| 2   | Fonts via `next/font/google`            | Always include `cyrillic` + `cyrillic-ext` subsets  |
| 3   | `searchStore.ts.ts` double extension    | Do not rename                                       |
| 4   | Global `form {}` CSS rule               | Scope to `#admin-product-form form {}` only         |
| 5   | Focus outline                           | Override with `!important` where needed             |
| 6   | WayForPay script in layout              | Keep `strategy="lazyOnload"` — don't change         |
| 7   | NextAuth v5 beta                        | API differs from v4 — always check authjs.dev       |
| 8   | `NEXT_PUBLIC_API_URL` missing protocol  | Ensure it's a full URL with `https://`              |
| 9   | WayForPay `authorizationCode`           | Backend-only HMAC-MD5 — never compute on frontend   |
| 10  | `product_name` / `price` in order_items | These are snapshots — don't join to products table  |

---

## 13. Environment Variables

### Frontend `.env.local`

```
NEXT_PUBLIC_API_URL=https://...railway.app   # no trailing slash
AUTH_SECRET=                                  # min 32 chars
NEXT_PUBLIC_SITE_URL=https://come-by-shop.com
NEXTAUTH_URL=http://localhost:3000            # dev only
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CLOUDINARY_CLOUD_NAME=dk9yjgta3
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=dk9yjgta3
WAYFORPAY_MERCHANT_ACCOUNT=
WAYFORPAY_SECRET_KEY=
```

### Backend `.env`

```
DATABASE_URL=                     # Neon connection string
JWT_SECRET=                       # min 32 chars
ALLOWED_ORIGIN=https://...        # frontend URL for CORS
TURBOSMS_TOKEN=
TURBOSMS_SENDER=ComeBySHOP
WAYFORPAY_MERCHANT_ACCOUNT=
WAYFORPAY_SECRET_KEY=
WAYFORPAY_DOMAIN=come-by-shop.com
EMAIL_PROVIDER_API_KEY=           # Resend API key
EMAIL_FROM_ADDRESS=noreply@come-by-shop.com
GOOGLE_CLIENT_ID=                 # must equal the frontend GOOGLE_CLIENT_ID
PUBLIC_API_URL=                   # optional, public backend URL for WayForPay serviceUrl
PORT=4000
DEV_OTP=000000                    # DEV ONLY — fixed OTP, no SMS sent (ignored when NODE_ENV=production)
```

### Infrastructure

| Service  | Platform                        |
| -------- | ------------------------------- |
| Frontend | Vercel                          |
| Backend  | Railway (port 4000)             |
| Database | Neon (serverless PostgreSQL)    |
| Images   | Cloudinary (cloud: `dk9yjgta3`) |
| Email    | Resend                          |
| SMS      | TurboSMS                        |

---

## 14. Response Format for AI

- **Return only changed files** — never the full project or a ZIP
- First line of each file must be a path comment: `// frontend/components/Header.tsx`
- If a change requires a new env variable — state which one
- If a new dependency is needed — ask before adding it
- Fix all TypeScript errors alongside the change — don't leave `as any` without a comment
- Avoid comments — only add them where truly necessary (non-obvious logic, known gotchas, security notes)
- When comments are needed — write them in Ukrainian

---

## 15. Reference Links

| Topic              | URL                                                |
| ------------------ | -------------------------------------------------- |
| Next.js App Router | https://nextjs.org/docs/app                        |
| NextAuth v5        | https://authjs.dev/getting-started/migrating-to-v5 |
| Zustand            | https://zustand.docs.pmnd.rs                       |
| TanStack Query 5   | https://tanstack.com/query/latest                  |
| Drizzle ORM        | https://orm.drizzle.team/docs/overview             |
| Fastify 5          | https://fastify.dev/docs/latest                    |
| Neon + Drizzle     | https://neon.tech/docs/guides/drizzle              |
| WayForPay API      | https://wiki.wayforpay.com                         |
| Cloudinary Upload  | https://cloudinary.com/documentation/upload_images |
| TurboSMS           | https://turbosms.ua/api.html                       |
