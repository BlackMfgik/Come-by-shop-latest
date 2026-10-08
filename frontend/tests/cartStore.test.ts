/**
 * tests/cartStore.test.ts
 *
 * Тестуємо логіку Zustand-стору кошика
 *
 * 🎓 ЩО ТАКЕ ТЕСТ СТОРУ:
 *   Zustand-стор — це просто об'єкт зі станом і функціями.
 *   Ми викликаємо функції (addItem, removeItem...) і перевіряємо
 *   що стан змінився правильно.
 *
 * 🎓 КЛЮЧОВІ КОНЦЕПЦІЇ ДЛЯ ІНТЕРВ'Ю:
 *   beforeEach() — код що запускається ПЕРЕД кожним тестом
 *   afterEach()  — код що запускається ПІСЛЯ кожного тесту
 *   Ізоляція тестів — кожен тест має починатись з чистого стану,
 *   щоб результат одного тесту не впливав на інший
 *
 * 🎓 ПРОБЛЕМА З ZUSTAND PERSIST:
 *   Zustand з persist намагається читати localStorage.
 *   В jsdom localStorage є, але між тестами треба очищати.
 */

import { describe, test, expect, beforeEach } from "vitest";
import { useCartStore } from "../store/cartStore";

// 🎓 beforeEach — скидаємо кошик перед кожним тестом
// Інакше товар доданий в тесті 1 залишиться в тесті 2
beforeEach(() => {
  useCartStore.getState().clearCart();
});

// ─────────────────────────────────────────────────────────────────────────────
// addItem
// ─────────────────────────────────────────────────────────────────────────────

describe("addItem", () => {
  test("не мутує попередній стан при повторному додаванні", () => {
    const { addItem } = useCartStore.getState();
    addItem("Піца", 100, "/img.jpg", "", 1);
    const before = useCartStore.getState().items[0];

    addItem("Піца", 100, "/img.jpg", "", 1);

    expect(before.quantity).toBe(1);
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  test("додає товар в порожній кошик", () => {
    const { addItem, items } = useCartStore.getState();

    addItem("Піца Маргарита", 250, "/img.jpg", "Смачна", 1);

    // 🎓 Після виклику дії — знову беремо стан через getState()
    // бо items що ми витягнули вище — це стара копія
    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].name).toBe("Піца Маргарита");
    expect(state.items[0].quantity).toBe(1);
    expect(state.items[0].price).toBe(250);
  });

  test("збільшує кількість якщо товар вже є (за id)", () => {
    const { addItem } = useCartStore.getState();

    // Додаємо один і той самий товар двічі
    addItem("Піца", 250, "/img.jpg", "", 42);
    addItem("Піца", 250, "/img.jpg", "", 42);

    const state = useCartStore.getState();
    // Має бути 1 позиція, але quantity = 2
    expect(state.items).toHaveLength(1);
    expect(state.items[0].quantity).toBe(2);
  });

  test("додає різні товари як окремі позиції", () => {
    const { addItem } = useCartStore.getState();

    addItem("Піца", 250, "/img.jpg", "", 1);
    addItem("Бургер", 180, "/img2.jpg", "", 2);

    expect(useCartStore.getState().items).toHaveLength(2);
  });

  // 🎓 Тест обчислення total — перевіряємо бізнес-логіку
  test("правильно рахує total при додаванні", () => {
    const { addItem } = useCartStore.getState();

    addItem("Піца", 250, "/img.jpg", "", 1); // 250
    addItem("Бургер", 180, "/img2.jpg", "", 2); // 180
    // total = 250 + 180 = 430

    expect(useCartStore.getState().total).toBe(430);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateQty
// ─────────────────────────────────────────────────────────────────────────────

describe("updateQty", () => {
  test("збільшує кількість на delta +1", () => {
    useCartStore.getState().addItem("Піца", 250, "/img.jpg", "", 1);
    useCartStore.getState().updateQty("Піца", +1);

    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  test("зменшує кількість на delta -1", () => {
    const { addItem } = useCartStore.getState();
    addItem("Піца", 250, "/img.jpg", "", 1);
    addItem("Піца", 250, "/img.jpg", "", 1); // quantity = 2
    useCartStore.getState().updateQty("Піца", -1);

    expect(useCartStore.getState().items[0].quantity).toBe(1);
  });

  // 🎓 Edge case — що відбувається при quantity = 0?
  // За логікою стору .filter(i => i.quantity > 0) видаляє такі товари
  test("видаляє товар якщо quantity стає 0", () => {
    useCartStore.getState().addItem("Піца", 250, "/img.jpg", "", 1);
    useCartStore.getState().updateQty("Піца", -1); // 1 - 1 = 0 → видалити

    expect(useCartStore.getState().items).toHaveLength(0);
  });

  test("оновлює total після зміни кількості", () => {
    useCartStore.getState().addItem("Піца", 250, "/img.jpg", "", 1);
    useCartStore.getState().updateQty("Піца", +1); // 2 * 250 = 500

    expect(useCartStore.getState().total).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// removeItem
// ─────────────────────────────────────────────────────────────────────────────

describe("removeItem", () => {
  test("видаляє товар з кошика", () => {
    useCartStore.getState().addItem("Піца", 250, "/img.jpg", "", 1);
    useCartStore.getState().addItem("Бургер", 180, "/img2.jpg", "", 2);
    useCartStore.getState().removeItem("Піца");

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].name).toBe("Бургер");
  });

  test("оновлює total після видалення", () => {
    useCartStore.getState().addItem("Піца", 250, "/img.jpg", "", 1);
    useCartStore.getState().addItem("Бургер", 180, "/img2.jpg", "", 2);
    useCartStore.getState().removeItem("Піца"); // залишається тільки 180

    expect(useCartStore.getState().total).toBe(180);
  });

  test("не ламається якщо видаляти неіснуючий товар", () => {
    useCartStore.getState().addItem("Піца", 250, "/img.jpg", "", 1);
    // Видаляємо товар якого немає — не має кидати error
    expect(() => {
      useCartStore.getState().removeItem("Суші");
    }).not.toThrow();

    // Піца залишилась
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clearCart
// ─────────────────────────────────────────────────────────────────────────────

describe("clearCart", () => {
  test("очищає всі товари і total", () => {
    useCartStore.getState().addItem("Піца", 250, "/img.jpg", "", 1);
    useCartStore.getState().addItem("Бургер", 180, "/img2.jpg", "", 2);
    useCartStore.getState().clearCart();

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.total).toBe(0);
  });
});
