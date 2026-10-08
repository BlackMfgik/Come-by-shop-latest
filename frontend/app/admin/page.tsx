import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AdminPanel from "@/components/AdminPanel";
import { auth } from "@/auth";
import { apiGetMe } from "@/lib/api";

export const metadata: Metadata = {
  title: "Адмін — Come by Shop",
};

/**
 * 🔌 BACKEND: GET /api/auth/me  [AUTH REQUIRED]
 * Headers:  Authorization: Bearer <token>
 * Response: UserInfo { id, email, name, admin: true, ... }
 *
 * Токен бекенду береться з сесії NextAuth (session.accessToken),
 * права адміна перевіряються бекендом, а не з даних сесії.
 */
async function getAdminUser() {
  const session = await auth();
  const token = session?.accessToken;
  if (!token) return null;

  try {
    const user = await apiGetMe(token);
    return user?.admin ? user : null;
  } catch {
    return null;
  }
}

export default async function AdminPage() {
  const user = await getAdminUser();

  if (!user) redirect("/");

  return (
    <>
      <Header />
      <main>
        <AdminPanel />
      </main>
      <Footer />
    </>
  );
}
