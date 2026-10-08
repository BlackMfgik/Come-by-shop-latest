import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/types";

interface CartState {
  items: CartItem[];
  total: number;
  addItem: (
    name: string,
    price: number,
    image: string,
    description: string,
    id: number | null,
  ) => void;
  updateQty: (name: string, delta: number) => void;
  removeItem: (name: string) => void;
  clearCart: () => void;
}

function calcTotal(items: CartItem[]): number {
  return items.reduce((s, i) => s + i.price * i.quantity, 0);
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      total: 0,

      addItem: (name, price, image, description, id) =>
        set((state) => {
          const matches = (i: CartItem) =>
            id != null ? i.id === id : i.name === name;
          const copy = state.items.some(matches)
            ? state.items.map((i) =>
                matches(i) ? { ...i, quantity: i.quantity + 1 } : i,
              )
            : [
                ...state.items,
                { id, name, price, image, description, quantity: 1 },
              ];
          return { items: copy, total: calcTotal(copy) };
        }),

      updateQty: (name, delta) =>
        set((state) => {
          const copy = state.items
            .map((i) =>
              i.name === name ? { ...i, quantity: i.quantity + delta } : i,
            )
            .filter((i) => i.quantity > 0);
          return { items: copy, total: calcTotal(copy) };
        }),

      removeItem: (name) =>
        set((state) => {
          const copy = state.items.filter((i) => i.name !== name);
          return { items: copy, total: calcTotal(copy) };
        }),

      clearCart: () => set({ items: [], total: 0 }),
    }),
    {
      name: "cart-storage",
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => (state) => {
        if (state) state.total = calcTotal(state.items);
      },
    },
  ),
);
