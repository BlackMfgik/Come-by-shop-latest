"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import CartSidebar from "./CartSidebar";
import ThemeToggle from "./ThemeToggle";
import { Search, ShoppingCart, User, Menu } from "lucide-react";
import { cldUrl, STATIC_IMAGES } from "@/lib/cld";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  SearchIcon,
} from "./ui/input-group";
import { useSearchStore } from "@/store/searchStore.ts";
import { useHydrated } from "@/hooks/useHydrated";

const SEARCH_PAGES = ["/", "/menu", "/shop", "/combo"];
const CART_PAGES = ["/", "/menu", "/shop", "/combo", "/about-us"];

const NAV_LINKS = [
  { href: "/", label: "Головна" },
  { href: "/menu", label: "Меню" },
  { href: "/shop", label: "Магазин" },
  { href: "/combo", label: "Комбо" },
  { href: "/about-us", label: "Про нас" },
];

export default function Header() {
  const hydrated = useHydrated();
  const { user } = useAuthStore();
  const { items } = useCartStore();
  const router = useRouter();
  const pathname = usePathname();
  const showSearch = SEARCH_PAGES.includes(pathname);
  const showCart = CART_PAGES.includes(pathname);
  const isAccountPage = pathname === "/account";

  const { setLiveQuery, clearQuery } = useSearchStore();

  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showSearch) {
      clearQuery();
      setSearchQuery("");
    }
  }, [pathname]);

  const cartCount = hydrated ? items.reduce((s, i) => s + i.quantity, 0) : 0;

  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [searchOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setCartOpen(false);
        setNavOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        !(e.target as HTMLElement).closest(".header-search-wrapper") &&
        !(e.target as HTMLElement).closest(".header-search-popup")
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearchQuery(val);
    if (showSearch) {
      setLiveQuery(val);
    }
  }

  function handleSearchClear() {
    setSearchQuery("");
    setLiveQuery("");
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!showSearch && searchQuery.trim()) {
      router.push(`/shop`);
      setLiveQuery(searchQuery.trim());
      setSearchOpen(false);
    }
  }

  return (
    <>
      <header>
        <Link className="logo" href="/" aria-label="Повернутись на головну">
          <img
            src={cldUrl(STATIC_IMAGES.logo, { w: 56 })}
            className="logo-img"
            alt=""
            width={38}
            height={38}
          />
          Come by
        </Link>

        <nav className={`nav-center${navOpen ? " active" : ""}`} id="nav">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setNavOpen(false)}
                className={isActive ? "nav-link-active" : undefined}
                aria-current={isActive ? "page" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="icons">
          {showSearch && (
            <div className="header-search-wrapper">
              <div
                className={`header-search-popup${searchOpen ? " active" : ""}`}
              >
                <form onSubmit={handleSearch}>
                  <InputGroup>
                    <InputGroupAddon align="inline-start">
                      <SearchIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      ref={inputRef}
                      id="search-input"
                      type="text"
                      placeholder="Пошук..."
                      value={searchQuery}
                      onChange={handleSearchChange}
                    />
                    {searchQuery && (
                      <InputGroupAddon align="inline-end">
                        <button
                          type="button"
                          onClick={handleSearchClear}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text-3)",
                            display: "flex",
                            alignItems: "center",
                            padding: 0,
                          }}
                          aria-label="Очистити пошук"
                        >
                          ✕
                        </button>
                      </InputGroupAddon>
                    )}
                  </InputGroup>
                </form>
              </div>

              <button
                className="header-search-toggle"
                id="search-btn"
                aria-label="Відкрити пошук"
                onClick={() => setSearchOpen((o) => !o)}
              >
                <Search size={24} />
              </button>
            </div>
          )}

          {showCart && (
            <button
              type="button"
              className="icons-shopping"
              aria-label={
                cartCount > 0 ? `Кошик, товарів: ${cartCount}` : "Кошик"
              }
              aria-expanded={cartOpen}
              aria-controls="cart-sidebar"
              onClick={() => setCartOpen((o) => !o)}
            >
              <ShoppingCart size={24} aria-hidden="true" />
              {cartCount > 0 && (
                <span className="cart-badge" aria-hidden="true">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </button>
          )}

          {!isAccountPage && (
            <Link
              className="icons-user"
              href={hydrated && user ? "/account" : "/login"}
              id="user-link"
              aria-label="Акаунт"
            >
              <User size={24} />
            </Link>
          )}

          <ThemeToggle />
        </div>

        <button
          type="button"
          className="burger"
          id="burger"
          aria-label={navOpen ? "Закрити меню" : "Відкрити меню"}
          aria-expanded={navOpen}
          aria-controls="nav"
          onClick={() => setNavOpen((o) => !o)}
        >
          <Menu size={24} aria-hidden="true" />
        </button>
      </header>

      <CartSidebar isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}
