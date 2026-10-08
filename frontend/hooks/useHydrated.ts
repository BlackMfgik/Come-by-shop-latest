import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * true лише після гідрації на клієнті.
 * Потрібно для UI, що залежить від localStorage (кошик, тема, авторизація),
 * щоб перший клієнтський рендер збігався з серверним HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
