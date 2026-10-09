import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiInitWayForPay = vi.fn();
vi.mock("@/lib/api", () => ({
  apiInitWayForPay: (...args: unknown[]) => apiInitWayForPay(...args),
  apiDevBindCard: vi.fn(),
  apiGetMe: vi.fn(),
  getFriendlyErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

import PaymentCardModal from "../components/modals/PaymentCardModal";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("PaymentCardModal — WayForPay Card Verify", () => {
  test("надсилає підписані бекендом поля POST-формою на сторінку WayForPay", async () => {
    apiInitWayForPay.mockResolvedValue({
      verify: {
        url: "https://secure.wayforpay.com/verify",
        fields: {
          merchantAccount: "shop",
          merchantSignature: "abc123",
          orderReference: "VERIFY-1-1",
          amount: "0",
        },
      },
    });

    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});

    render(
      <PaymentCardModal token="t" onSuccess={vi.fn()} onClose={vi.fn()} />,
    );

    fireEvent.click(await screen.findByText("Перейти до WayForPay"));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const form = submit.mock.contexts[0] as HTMLFormElement;
    expect(form.method.toLowerCase()).toBe("post");
    expect(form.action).toBe("https://secure.wayforpay.com/verify");
    const data = Object.fromEntries(new FormData(form));
    expect(data).toEqual({
      merchantAccount: "shop",
      merchantSignature: "abc123",
      orderReference: "VERIFY-1-1",
      amount: "0",
    });
  });

  test("не показує форму введення картки на продакшені", async () => {
    apiInitWayForPay.mockResolvedValue({
      verify: { url: "https://secure.wayforpay.com/verify", fields: {} },
    });
    render(
      <PaymentCardModal token="t" onSuccess={vi.fn()} onClose={vi.fn()} />,
    );
    await screen.findByText("Перейти до WayForPay");
    expect(screen.queryByPlaceholderText("MM/YY")).toBeNull();
  });
});
