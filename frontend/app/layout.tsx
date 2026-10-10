import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Manrope, Unbounded } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

// ⚠️ Попередження під час збірки якщо змінна не визначена
if (!process.env.NEXT_PUBLIC_SITE_URL) {
  console.warn(
    "[layout] NEXT_PUBLIC_SITE_URL не визначено. Буде використано https://come-by-shop.com",
  );
}

export const metadata: Metadata = {
  title: {
    default: "Come by Shop",
    template: "%s | Come by Shop",
  },
  description: "Замовляй їжу та продукти онлайн — оплата на місці чи тут",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://come-by-shop.com",
  ),
  openGraph: {
    type: "website",
    siteName: "Come by Shop",
    title: "Come by Shop",
    description: "Замовляй їжу та продукти онлайн — оплата на місці чи тут",
    images: [
      {
        url: `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/f_webp,q_auto/dhaneshdamodaran-fruits-7357732_1920_ozytfx`,
        width: 1200,
        height: 630,
        alt: "Come by Shop — інтернет-магазин їжі та напоїв",
      },
    ],
  },
};

// Обидва шрифти мають повну кирилицю (ї, є, ґ); роздаються з нашого домену
const unbounded = Unbounded({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  variable: "--font-unbounded",
  display: "swap",
});
const manrope = Manrope({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  variable: "--font-manrope",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0c" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f0" },
  ],
};

// Застосовує збережену тему до першого малювання — без спалаху темної теми
const themeScript = `try{var t=JSON.parse(localStorage.getItem("theme-storage")||"{}").state;if(t&&(t.theme==="light"||t.theme==="dark"))document.documentElement.setAttribute("data-theme",t.theme)}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="uk"
      data-scroll-behavior="smooth"
      className={`${unbounded.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link
          rel="icon"
          type="image/jpeg"
          href="https://res.cloudinary.com/dk9yjgta3/image/upload/f_auto/q_auto/a-minimalist-favicon-icon-design-featuri_nNTgwPA2WruO7u9WwSrn_w_1VKEM4CARVSCR7fL4KES2Q_sd_1_whqcyw.jpg"
        />
      </head>
      <body suppressHydrationWarning>
        {/* Фільтри перефарбовують зелений растровий логотип у --accent кожної теми */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
          <filter id="logo-tint-dark" colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues="0 0.115 0.231 0.346 0.461 0.576 0.718 0.859 1" />
              <feFuncG type="table" tableValues="0 0.162 0.325 0.487 0.649 0.812 0.875 0.937 1" />
              <feFuncB type="table" tableValues="0 0.084 0.168 0.252 0.336 0.42 0.613 0.807 1" />
            </feComponentTransfer>
          </filter>
          <filter id="logo-tint-light" colorInterpolationFilters="sRGB">
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues="0 0.048 0.096 0.144 0.191 0.239 0.493 0.746 1" />
              <feFuncG type="table" tableValues="0 0.096 0.191 0.287 0.383 0.478 0.652 0.826 1" />
              <feFuncB type="table" tableValues="0 0.03 0.06 0.089 0.119 0.149 0.433 0.716 1" />
            </feComponentTransfer>
          </filter>
        </svg>
        <Providers>{children}</Providers>
        {/* WayForPay widget script — lazyOnload щоб не блокувати рендер */}
        <Script
          src="https://secure.wayforpay.com/server/pay-widget.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
