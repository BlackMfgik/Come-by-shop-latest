"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, UtensilsCrossed, ShoppingCart, User } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useHydrated } from "@/hooks/useHydrated";

const NAV = [
  { href: "/", icon: <Home size={22} />, label: "Головна" },
  { href: "/menu", icon: <UtensilsCrossed size={22} />, label: "Меню" },
  { href: "/shop", icon: <ShoppingCart size={22} />, label: "Магазин" },
  { href: "/account", icon: <User size={22} />, label: "Акаунт" },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const storedCount = useCartStore((s) =>
    s.items.reduce((a, i) => a + i.quantity, 0),
  );
  const count = hydrated ? storedCount : 0;

  return (
    <nav className="mobile-bottom-nav" aria-label="Навігація">
      {NAV.map(({ href, icon, label }) => {
        const active =
          pathname === href || (href !== "/" && pathname.startsWith(href));
        const isCart = href === "/shop";
        return (
          <Link
            key={href}
            href={href}
            className={`mobile-nav-item${active ? " active" : ""}`}
          >
            <span className="mobile-nav-icon-wrap">
              {icon}
              {isCart && count > 0 && (
                <span className="mobile-nav-badge">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </span>
            <span className="mobile-nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
