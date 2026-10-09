import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCatalog from "@/components/ProductCatalog";
import Loading from "./loading";
import type { Product } from "@/types";
import { cldUrl, STATIC_IMAGES } from "@/lib/cld";

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
          <div className="hero-copy">
            <span className="hero-eyebrow">Кухня й крамниця в одному кошику</span>
            <h1>
              Замовляй їжу та продукти онлайн — <em>оплата на місці чи тут</em>
            </h1>
            <p className="hero-sub">
              Гарячі страви з меню, продукти з магазину й вигідні комбо. Додай у
              кошик і оформи замовлення за хвилину.
            </p>
            <div className="hero-actions">
              <Link href="/menu" className="hero-cta hero-cta--primary">
                Відкрити меню
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/shop" className="hero-cta hero-cta--ghost">
                До магазину
              </Link>
            </div>
          </div>
          <figure className="hero-photo">
            <img
              src={cldUrl(STATIC_IMAGES.hero, { w: 1200, angle: -90 })}
              alt="Свіжі фрукти й овочі"
              width={1200}
              height={1200}
              fetchPriority="high"
            />
          </figure>
        </section>
        <Suspense fallback={<Loading />}>
          <ProductCatalog initialProducts={products} limit={8} hideFilter />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
