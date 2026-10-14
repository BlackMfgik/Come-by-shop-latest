"use client";

import { useEffect, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { useThemeStore } from "@/store/themeStore";
import { Toaster } from "sonner";
import QueryProvider from "@/components/QueryProvider";
import SessionSync from "@/components/SessionSync";
import MobileBottomNav from "@/components/MobileBottomNav";

function ThemeInitializer() {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  return (
    <SessionProvider>
      <QueryProvider>
        <ThemeInitializer />
        <SessionSync />
        {children}
        <Toaster
          theme={theme === "dark" ? "dark" : "light"}
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              fontFamily: "var(--font-body)",
              borderRadius: "12px",
            },
            duration: 3800,
          }}
        />
        <MobileBottomNav />
      </QueryProvider>
    </SessionProvider>
  );
}
