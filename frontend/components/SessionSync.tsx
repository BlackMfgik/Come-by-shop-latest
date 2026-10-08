// components/SessionSync.tsx
"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useAuthStore } from "@/store/authStore";

export default function SessionSync() {
  const { data: session, status } = useSession();
  const { saveAuth, logout, setHasHydrated, user, token } = useAuthStore();

  useEffect(() => {
    if (status === "loading") return;

    setHasHydrated(true);

    if (status === "authenticated" && session) {
      const stale =
        user === null ||
        String(user.id) !== session.user.id ||
        (!!session.accessToken && token !== session.accessToken);
      if (stale) {
        saveAuth(session.accessToken ?? `nextauth_${session.user.id}`, {
          ...session.user,
          id: Number(session.user.id),
        });
      }
    } else if (status === "unauthenticated") {
      logout();
    }
  }, [status]);

  return null;
}
