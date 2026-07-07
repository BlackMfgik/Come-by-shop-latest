import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCatalog from "@/components/ProductCatalog";
import Loading from "@/app/loading";
import type { Product } from "@/types";

export const metadata: Metadata = {
  title: "Меню — Come by Shop",
  description: "Наше меню — смачні страви з доставкою. Замовляй онлайн!",
};

/**
 * 🔌 BACKEND: GET /api/products?category=Меню
 * або GET /api/products — якщо фільтр по категорії робиться на фронті
 *
 * ⚠️ Узгодити з бекендом: яке значення category для сторінки "Меню"?
 * Варіанти: "Меню" | "menu" | "їжа" — має співпадати з products.category в БД
 *
 * Cache: revalidate 60 секунд
 */
async function getProducts(): Promise<Product[]> {
  const externalBase = process.env.NEXT_PUBLIC_API_URL;

  if (!externalBase) {
    // 🔌 NEXT_PUBLIC_API_URL не встановлено — встановити в .env.local
    return [];
  }

  try {
    // 🔌 Опціонально: додати ?category=Меню для фільтрації на рівні бекенду
    const res = await fetch(`${externalBase}/api/products`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const products = await getProducts();
  return (
    <>
      <Header />
      <main>
        <Suspense fallback={<Loading />}>
          {/* Task 8: no hardcoded category — CategoryFilter handles it */}
          <ProductCatalog initialProducts={products} searchQuery={q} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
