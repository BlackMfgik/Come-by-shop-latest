// components/SessionSync.tsx
"use client";

import { useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import { useAuthStore } from "@/store/authStore";
import { apiGetMe } from "@/lib/api";

export default function SessionSync() {
  const { data: session, status } = useSession();
  const { saveAuth, logout, setHasHydrated, user, token } = useAuthStore();
  const accessToken = session?.accessToken;

  useEffect(() => {
    if (status === "loading") return;

    setHasHydrated(true);

    if (status === "authenticated" && session) {
      const stale =
        user === null ||
        String(user.id) !== session.user.id ||
        (!!accessToken && token !== accessToken);
      if (stale) {
        saveAuth(accessToken ?? `nextauth_${session.user.id}`, {
          ...session.user,
          id: Number(session.user.id),
        });
      }
    } else if (status === "unauthenticated") {
      logout();
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Сесія NextAuth містить лише базові поля — повний профіль
  // (phone_verified, картка, has_password) беремо з бекенду
  useEffect(() => {
    if (status !== "authenticated" || !accessToken) return;
    let cancelled = false;

    apiGetMe(accessToken)
      .then((fresh) => {
        if (!cancelled) saveAuth(accessToken, fresh);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if ((err as { status?: number }).status === 401) {
          logout();
          void signOut({ redirect: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status, accessToken, saveAuth, logout]);

  return null;
}
