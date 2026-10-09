import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCatalog from "@/components/ProductCatalog";
import Loading from "./loading";
import type { Product } from "@/types";

export const metadata: Metadata = {
  title: "Come by Shop — Замовляй їжу та продукти онлайн",
  description:
    "Замовляй їжу та продукти онлайн — оплата на місці чи тут. Широкий асортимент: меню, магазин, комбо-набори.",
};

/**
 * 🔌 BACKEND: GET /api/products
 * Параметри: немає (головна сторінка показує всі категорії, перші 8 товарів)
 * Cache: revalidate 60 секунд
 * Повертає: Product[] — порожній масив якщо бекенд недоступний
 */
async function getProducts(): Promise<Product[]> {
  const externalBase = process.env.NEXT_PUBLIC_API_URL;

  if (!externalBase) {
    // 🔌 NEXT_PUBLIC_API_URL не встановлено — встановити в .env.local
    return [];
  }

  try {
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

export default async function HomePage() {
  const products = await getProducts();

  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <h1>
            Замовляй їжу та
            <br />
            продукти онлайн —<br />
            оплата на місці чи тут
          </h1>
        </section>
        <Suspense fallback={<Loading />}>
          <ProductCatalog initialProducts={products} limit={8} hideFilter />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
