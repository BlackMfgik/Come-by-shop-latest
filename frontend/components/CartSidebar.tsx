"use client";

import { useState, useRef, useEffect } from "react";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { apiCreateOrder, getFriendlyErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import OrderModal from "./OrderModal";
import LoginRequiredModal from "./modals/LoginRequiredModal";
import OrderSuccessModal from "./modals/OrderSuccessModal";
import IncompleteProfileModal from "./modals/IncompleteProfileModal";
import EmptyState from "./ui/EmptyState";
import { getProfileGaps, type ProfileGap } from "@/lib/profileCheck";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartSidebar({ isOpen, onClose }: Props) {
  const { items, updateQty, removeItem, total, clearCart } = useCartStore();
  const { token, user } = useAuthStore();
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [successTotal, setSuccessTotal] = useState(0);
  const [incompleteModalOpen, setIncompleteModalOpen] = useState(false);
  const [profileGaps, setProfileGaps] = useState<ProfileGap[]>([]);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest(".icons-shopping")
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onClose]);

  function handleCheckoutClick() {
    if (!token) {
      setLoginModalOpen(true);
      return;
    }

    const gaps = getProfileGaps(user);
    if (gaps.length > 0) {
      setProfileGaps(gaps);
      setIncompleteModalOpen(true);
      return;
    }

    setOrderModalOpen(true);
  }

  async function handleConfirmOrder() {
    if (!token) {
      setOrderModalOpen(false);
      setLoginModalOpen(true);
      return;
    }

    const gaps = getProfileGaps(user);
    if (gaps.length > 0) {
      setOrderModalOpen(false);
      setProfileGaps(gaps);
      setIncompleteModalOpen(true);
      return;
    }

    const validItems = items
      .filter((i) => i.id != null && i.quantity > 0)
      .map((i) => ({ productId: i.id!, quantity: i.quantity }));
    if (!validItems.length) {
      toast.info("Кошик порожній");
      return;
    }
    try {
      await apiCreateOrder(validItems, token);
      const orderTotal = total;
      clearCart();
      setOrderModalOpen(false);
      onClose();
      setSuccessTotal(orderTotal);
      setSuccessModal(true);
    } catch (err: unknown) {
      toast.error(
        getFriendlyErrorMessage(
          err,
          "Помилка при оформленні замовлення",
        ),
      );
    }
  }

  return (
    <>
      <div
        ref={sidebarRef}
        className={`cart-sidebar${isOpen ? " active" : ""}`}
        id="cart-sidebar"
      >
        <div className="cart-header">
          <h2>Моя корзина</h2>
          <button id="close-cart" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="cart-content">
          {items.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart size={36} strokeWidth={1.5} />}
              title="Кошик порожній"
              subtitle="Додайте щось смачненьке~"
            />
          ) : (
            items.map((item) => (
              <div className="cart-item" key={item.name}>
                <button
                  className="remove-item"
                  onClick={() => removeItem(item.name)}
                  aria-label="Видалити товар"
                >
                  ✕
                </button>

                <img src={item.image} alt={item.name} width={48} height={48} />

                <div className="cart-item-info">
                  <strong>{item.name}</strong>
                  <span className="cart-item-price">
                    {Number(item.price).toFixed(2)} ₴
                  </span>

                  <div className="cart-controls">
                    <button
                      className="qty-btn"
                      onClick={() => updateQty(item.name, -1)}
                      aria-label="Зменшити кількість"
                    >
                      −
                    </button>
                    <span className="qty-value">{item.quantity}</span>
                    <button
                      className="qty-btn qty-btn--plus"
                      onClick={() => updateQty(item.name, 1)}
                      aria-label="Збільшити кількість"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="cart-total">
            <div className="cart-summary">
              <strong>Загальна сума:</strong>
              <span>{Number(total).toFixed(2)} ₴</span>
            </div>
          </div>
        )}

        <div className="cart-footer">
          <button
            id="checkout-btn"
            disabled={items.length === 0}
            className={items.length === 0 ? "checkout-disabled" : ""}
            onClick={handleCheckoutClick}
          >
            Оформити замовлення
          </button>
        </div>
      </div>

      {orderModalOpen && (
        <OrderModal
          address={user?.address || ""}
          cardMaskedPan={user?.card_masked_pan || ""}
          cardType={user?.card_type}
          total={total}
          onCancel={() => setOrderModalOpen(false)}
          onConfirm={handleConfirmOrder}
        />
      )}

      {loginModalOpen && (
        <LoginRequiredModal onClose={() => setLoginModalOpen(false)} />
      )}

      {incompleteModalOpen && (
        <IncompleteProfileModal
          gaps={profileGaps}
          onClose={() => setIncompleteModalOpen(false)}
        />
      )}

      {successModal && (
        <OrderSuccessModal
          total={successTotal}
          onClose={() => setSuccessModal(false)}
        />
      )}
    </>
  );
}
