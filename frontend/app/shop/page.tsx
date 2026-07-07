import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCatalog from "@/components/ProductCatalog";
import Loading from "@/app/loading";
import type { Product } from "@/types";

export const metadata: Metadata = {
  title: "Магазин — Come by Shop",
  description: "Широкий асортимент продуктів в інтернет-магазині Come by Shop.",
};

/**
 * 🔌 BACKEND: GET /api/products?category=Магазин
 * або GET /api/products — якщо фільтр по категорії робиться на фронті
 *
 * ⚠️ Узгодити з бекендом: яке значення category для сторінки "Магазин"?
 * Варіанти: "Магазин" | "shop" | "продукти" — має співпадати з products.category в БД
 *
 * Cache: revalidate 60 секунд
 */
async function getProducts(): Promise<Product[]> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";

  if (!base) {
    // 🔌 NEXT_PUBLIC_API_URL не встановлено — встановити в .env.local
    return [];
  }

  try {
    // 🔌 Опціонально: додати ?category=Магазин для фільтрації на рівні бекенду
    const res = await fetch(`${base}/api/products`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function ShopPage({
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
          <ProductCatalog initialProducts={products} searchQuery={q} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
