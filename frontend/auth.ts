import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { UserInfo } from "@/types";

declare module "next-auth" {
  interface Session {
    user: Omit<UserInfo, "id"> & {
      id: string;
      emailVerified?: Date | null;
      image?: string | null;
    };
    accessToken?: string;
  }
  interface User {
    accessToken?: string;
    phone?: string;
    address?: string;
    payment?: string;
    admin?: boolean;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
        deviceId: { label: "Device ID", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;
        const deviceId =
          (credentials?.deviceId as string) || crypto.randomUUID();

        if (!email || !password) return null;

        /**
         * 🔌 ENDPOINT: POST /api/auth/login
         * Request:  { email, password }
         * Response: { token, user: UserInfo }
         * Errors:   401 → null (NextAuth показує CredentialsSignin помилку)
         * ⚙️ Бекенд: bcrypt.compare(password, hash), генерувати JWT
         */
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/auth/login`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password, deviceId }),
            },
          );

          if (!res.ok) return null;
          const data = await res.json();

          // requires_2fa обробляється preflight-запитом у login/page.tsx
          if (data.requires_2fa) return null;

          return {
            ...data.user,
            id: String(data.user.id),
            accessToken: data.token,
          };
        } catch (error) {
          console.error("Login error:", error);
          return null;
        }
      },
    }),

    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        /**
         * 🔌 ENDPOINT: POST /api/auth/google
         * Request:  { email, name?, image? }  (дані від Google)
         * Response: { token, user: UserInfo }
         * Логіка:   якщо email існує → логін, інакше → авто-реєстрація
         * ⚠️ НЕ передавати Google idToken — тільки профільні дані
         */
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/auth/google`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: user.email,
                name: user.name,
                image: user.image,
              }),
            },
          );
          if (!res.ok) return false;
          const data = await res.json();
          user.id = String(data.user.id);
          user.name = data.user.name;
          user.email = data.user.email;
          user.phone = data.user.phone ?? "";
          user.address = data.user.address ?? "";
          user.payment = data.user.payment ?? "";
          user.admin = data.user.admin ?? false;
          user.accessToken = data.token;
        } catch (error) {
          console.error("Google auth error:", error);
          return false;
        }
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token["userInfo"] = {
          id: Number(user.id),
          name: user.name ?? "",
          email: user.email ?? "",
          phone: user.phone ?? "",
          address: user.address ?? "",
          payment: user.payment ?? "",
          admin: user.admin ?? false,
        } satisfies UserInfo;
        token["accessToken"] = user.accessToken;
        token.sub = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      if (token["userInfo"]) {
        session.user = {
          ...(token["userInfo"] as UserInfo),
          id: token.sub!,
          emailVerified: null,
        };
        session.accessToken = token["accessToken"] as string | undefined;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
    newUser: "/account",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },

  trustHost: true,

  debug: process.env.NODE_ENV === "development",
});
