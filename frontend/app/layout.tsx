import type { Metadata, Viewport } from "next";
import Script from "next/script";
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
    <html lang="uk" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link
          rel="icon"
          type="image/jpeg"
          href="https://res.cloudinary.com/dk9yjgta3/image/upload/f_auto/q_auto/a-minimalist-favicon-icon-design-featuri_nNTgwPA2WruO7u9WwSrn_w_1VKEM4CARVSCR7fL4KES2Q_sd_1_whqcyw.jpg"
        />
      </head>
      <body suppressHydrationWarning>
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
