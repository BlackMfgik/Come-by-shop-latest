"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import {
  apiUpdateProfile,
  apiGetMyOrders,
  getFriendlyErrorMessage,
} from "@/lib/api";
import type { UserInfo } from "@/types";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EmptyState from "@/components/ui/EmptyState";
import AddressAutocomplete from "@/components/ui/AddressAutocomplete";
import MaskedPhone from "@/components/ui/MaskedPhone";
import ChangeEmailModal from "@/components/modals/ChangeEmailModal";
import ConfirmPasswordModal from "@/components/modals/ConfirmPasswordModal";
import ChangePasswordModal from "@/components/modals/ChangePasswordModal";
import ForgotPasswordModal from "@/components/modals/ForgotPasswordModal";
import PhoneVerifyModal from "@/components/modals/PhoneVerifyModal";
import PaymentCardModal from "@/components/modals/PaymentCardModal";
import {
  User,
  Mail,
  Phone,
  Lock,
  CreditCard,
  MapPin,
  LogOut,
  ShoppingBag,
  ChevronRight,
  ChevronDown,
  Pencil,
  Package,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

type Tab = "profile" | "orders";
// Поле пароля більше не іде через EditModal — обробляємо у ChangePasswordModal
type Field = "name" | "email" | "phone" | "password" | "payment" | "address";
// Які дії потребують підтвердження пароля перед відкриттям модалки
type ConfirmAction = "payment" | "phone" | "email";

const FIELD_LABELS: Record<Field, string> = {
  name: "Редагувати ім'я",
  email: "Редагувати ел. пошту",
  phone: "Редагувати номер телефону",
  password: "Змінити пароль",
  payment: "Редагувати способи оплати",
  address: "Редагувати адресу",
};

// Пояснення в модалці ConfirmPasswordModal залежно від дії
const CONFIRM_DESCRIPTIONS: Record<ConfirmAction, string> = {
  phone: "Введіть пароль для зміни номера телефону",
  email: "Введіть пароль для зміни електронної пошти",
  payment: "Введіть пароль для доступу до платіжних даних",
};

// ─── EditModal (тільки для name та address) ───────────────────────────────────

interface EditModalProps {
  field: Extract<Field, "name" | "address">;
  currentValue: string;
  onSave: (val: string) => void;
  onClose: () => void;
  saving?: boolean;
}

function EditModal({
  field,
  currentValue,
  onSave,
  onClose,
  saving,
}: EditModalProps) {
  const [val, setVal] = useState(currentValue);

  return (
    <div
      id="edit-modal"
      className="modal"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content" role="document">
        <button className="modal-close" aria-label="Закрити" onClick={onClose}>
          &times;
        </button>
        <h3 id="modal-title">{FIELD_LABELS[field]}</h3>

        <div id="modal-row-single">
          {field === "address" ? (
            <AddressAutocomplete
              value={val}
              onChange={setVal}
              placeholder="Введіть адресу доставки"
              id="modal-address-input"
              className="modal-input"
            />
          ) : (
            <input
              id="modal-input"
              className="modal-input"
              type="text"
              value={val}
              onChange={(e) => setVal(e.target.value)}
            />
          )}
        </div>

        <div className="modal-buttons">
          <button
            id="modal-cancel"
            className="btn btn-secondary"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
          >
            Скасувати
          </button>
          <button
            id="modal-save"
            className="btn btn-primary"
            type="button"
            disabled={saving}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSave(val.trim())}
          >
            {saving ? "Зберігаємо…" : "Зберегти"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── OrderHistory ─────────────────────────────────────────────────────────────

function OrderHistory({ token }: { token: string }) {
  const [openOrderId, setOpenOrderId] = useState<number | null>(null);

  const {
    data: orders = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["orders", token],
    queryFn: () => apiGetMyOrders(token),
    staleTime: 30_000,
  });

  if (isLoading)
    return (
      <EmptyState
        icon={<ClipboardList size={36} strokeWidth={1.5} />}
        title="Завантаження замовлень…"
      />
    );
  if (isError)
    return (
      <p style={{ color: "var(--red, #e53935)" }}>
        Не вдалося завантажити замовлення
      </p>
    );
  if (orders.length === 0)
    return (
      <EmptyState
        icon={<ShoppingBag size={36} strokeWidth={1.5} />}
        title="Замовлень поки немає"
        subtitle="Оформіть перше замовлення в магазині~"
      />
    );

  return (
    <div className="orders-list">
      {orders.map((order) => {
        const isDelivered =
          order.status === "Доставлено" || order.status === "delivered";
        const isOpen = openOrderId === order.id;
        return (
          <div key={order.id} className={`order-card${isOpen ? " open" : ""}`}>
            <button
              className="order-card-header"
              onClick={() => setOpenOrderId(isOpen ? null : order.id)}
              aria-expanded={isOpen}
            >
              <div className="order-card-left">
                <span className="order-number">Замовлення #{order.id}</span>
                <span className="order-date">
                  {new Date(order.createdAt).toLocaleString("uk-UA")}
                </span>
              </div>
              <div className="order-card-right">
                <span
                  className="order-status"
                  style={{ background: isDelivered ? "#27ae60" : "#e67e22" }}
                >
                  {order.status}
                </span>
                <span className="order-total-preview">
                  {Number(order.total).toFixed(2)} ₴
                </span>
                <span className={`order-chevron${isOpen ? " rotated" : ""}`}>
                  <ChevronDown size={18} />
                </span>
              </div>
            </button>
            {isOpen && (
              <div className="order-card-body">
                <div className="order-items">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="order-item-row">
                      <span className="order-item-name">
                        {item.productName} × {item.quantity}
                      </span>
                      <span className="order-item-price">
                        {(Number(item.price) * item.quantity).toFixed(2)} ₴
                      </span>
                    </div>
                  ))}
                </div>
                <div className="order-summary-row">
                  <span>Разом:</span>
                  <span>{Number(order.total).toFixed(2)} ₴</span>
                </div>
                <div style={{ marginTop: 6 }}>
                  <span
                    className="order-status"
                    style={{
                      background: isDelivered ? "#27ae60" : "#e67e22",
                      display: "inline-block",
                    }}
                  >
                    {order.status}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── AccountItem ──────────────────────────────────────────────────────────────

interface AccountItemProps {
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode; // ReactNode щоб підтримувати <MaskedPhone />
  badge?: React.ReactNode;
  field: Field;
  onEdit: (f: Field) => void;
  isArrow?: boolean;
}

function AccountItem({
  icon,
  label,
  value,
  badge,
  field,
  onEdit,
  isArrow,
}: AccountItemProps) {
  return (
    <div
      className="account-item"
      onClick={() => onEdit(field)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onEdit(field)}
      aria-label={`Редагувати ${label}`}
    >
      <div className="item-info">
        <span className="account-item-icon">{icon}</span>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <strong>{label}</strong>
            {badge}
          </div>
          {value && <p>{value}</p>}
        </div>
      </div>
      <span className="account-item-icon" style={{ color: "var(--text-3)" }}>
        {isArrow ? <ChevronRight size={18} /> : <Pencil size={16} />}
      </span>
    </div>
  );
}

// ─── AccountPage ──────────────────────────────────────────────────────────────

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountPageContent />
    </Suspense>
  );
}

function AccountPageContent() {
  const { user, token, saveAuth, logout, _hasHydrated } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) ?? "profile";
  const [tab, setTab] = useState<Tab>(initialTab);

  async function handleLogout() {
    logout();
    queryClient.clear();
    // Без signOut сесія NextAuth лишається і SessionSync знову логінить юзера
    await signOut({ redirect: false });
    router.push("/login");
  }

  // Поля що редагуються через старий EditModal (тільки name та address)
  const [editField, setEditField] = useState<Extract<
    Field,
    "name" | "address"
  > | null>(null);

  // ── Стани модалок ─────────────────────────────────────────────────────────

  // Підтвердження пароля перед чутливою дією
  const [confirmPwOpen, setConfirmPwOpen] = useState(false);
  const [confirmPwAction, setConfirmPwAction] = useState<ConfirmAction | null>(
    null,
  );

  // Після підтвердження пароля — відкриваємо відповідну модалку
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  // Окрема модалка для зміни пароля (зі своїм OTP-кроком)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);

  // ── Відображувані дані профілю ────────────────────────────────────────────

  const [displayName, setDisplayName] = useState("");
  const [displayEmail, setDisplayEmail] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [displayPhoneVerified, setDisplayPhoneVerified] = useState(false);
  const [displayAddress, setDisplayAddress] = useState("");
  const [displayCardMasked, setDisplayCardMasked] = useState("");
  const [displayCardType, setDisplayCardType] = useState("");

  // ── TanStack Query мутація профілю ───────────────────────────────────────

  const updateProfileMutation = useMutation({
    mutationFn: (data: Partial<UserInfo>) => apiUpdateProfile(data, token!),
    onSuccess: (updated) => {
      saveAuth(token!, { ...user!, ...updated });
      setDisplayName(updated.name ?? "");
      setDisplayAddress(updated.address ?? "");
      toast.success("Профіль оновлено");
      setEditField(null);
    },
    onError: (err) =>
      toast.error(getFriendlyErrorMessage(err, "Помилка при збереженні")),
  });

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!user) {
      router.push("/login");
      return;
    }
    setDisplayName(user.name ?? "");
    setDisplayEmail(user.email ?? "");
    setDisplayPhone(user.phone ?? "");
    setDisplayPhoneVerified(user.phone_verified ?? false);
    setDisplayAddress(user.address ?? "");
    setDisplayCardMasked(user.card_masked_pan ?? user.payment ?? "");
    setDisplayCardType(user.card_type ?? "");
  }, [user, router, _hasHydrated]);

  if (!_hasHydrated || !user) return null;

  // ── Хелпери ──────────────────────────────────────────────────────────────

  /** Відкрити ConfirmPasswordModal перед чутливою дією */
  function openWithPasswordConfirm(action: ConfirmAction) {
    // OAuth-юзер без пароля — одразу відкриваємо потрібну модалку
    if (!user?.has_password) {
      if (action === "payment") setPaymentModalOpen(true);
      else if (action === "phone") setPhoneModalOpen(true);
      else if (action === "email") setChangeEmailOpen(true);
      return;
    }
    // Якщо поле ще не заповнене — нема чого захищати, відкриваємо одразу
    if (action === "phone" && !displayPhone) {
      setPhoneModalOpen(true);
      return;
    }
    if (action === "payment" && !displayCardMasked) {
      setPaymentModalOpen(true);
      return;
    }
    setConfirmPwAction(action);
    setConfirmPwOpen(true);
  }

  /** Після успішного підтвердження пароля — відкриваємо потрібну модалку */
  function handleConfirmPasswordSuccess() {
    setConfirmPwOpen(false);
    if (confirmPwAction === "payment") setPaymentModalOpen(true);
    else if (confirmPwAction === "phone") setPhoneModalOpen(true);
    else if (confirmPwAction === "email") setChangeEmailOpen(true);
    setConfirmPwAction(null);
  }

  function handleEditField(field: Field) {
    switch (field) {
      case "email":
        // Спочатку підтверджуємо пароль
        openWithPasswordConfirm("email");
        break;
      case "phone":
        // Спочатку підтверджуємо пароль
        openWithPasswordConfirm("phone");
        break;
      case "payment":
        openWithPasswordConfirm("payment");
        break;
      case "password":
        setChangePasswordOpen(true);
        break;
      case "name":
      case "address":
        setEditField(field);
        break;
    }
  }

  function handleSave(field: Extract<Field, "name" | "address">, val: string) {
    updateProfileMutation.mutate({ [field]: val });
  }

  function cardDisplay(): string {
    if (!displayCardMasked) return "Не додано";
    const type = displayCardType ? `${displayCardType} ` : "";
    return `${type}${displayCardMasked}`;
  }

  const isSaving = updateProfileMutation.isPending;

  // ── Маска для телефону в підказці ChangePasswordModal ────────────────────
  function getMaskedPhone(): string {
    if (!displayPhone) return "";
    const digits = displayPhone.replace(/\D/g, "");
    if (digits.startsWith("380") && digits.length === 12) {
      return `+380 ** *** ** ${digits.slice(-2)}`;
    }
    return displayPhone;
  }

  // ── Рендер ───────────────────────────────────────────────────────────────

  return (
    <>
      <Header />
      <main className="account-page">
        <aside className="account-sidebar">
          <ul>
            <li
              id="profile-tab"
              className={tab === "profile" ? "active" : ""}
              onClick={() => setTab("profile")}
            >
              <span className="account-item-icon">
                <User size={18} />
              </span>
              <span>Обліковий запис</span>
            </li>
            <li
              id="orders-tab"
              className={tab === "orders" ? "active" : ""}
              onClick={() => setTab("orders")}
            >
              <span className="account-item-icon">
                <Package size={18} />
              </span>
              <span>Замовлення</span>
            </li>
          </ul>
        </aside>

        <section className="account-content">
          {tab === "profile" && (
            <div id="profile-content">
              <h1>Обліковий запис</h1>
              <div className="account-card">
                <AccountItem
                  icon={<User size={18} />}
                  label="Ім'я"
                  value={displayName}
                  field="name"
                  onEdit={handleEditField}
                />
                <AccountItem
                  icon={<Mail size={18} />}
                  label="Адреса ел. пошти"
                  value={displayEmail}
                  field="email"
                  onEdit={handleEditField}
                />
                <AccountItem
                  icon={<Phone size={18} />}
                  label="Номер телефону"
                  // MaskedPhone замінює raw рядок — показує +380 ** *** ** 67
                  value={
                    displayPhone ? (
                      <MaskedPhone phone={displayPhone} />
                    ) : (
                      "Не вказано"
                    )
                  }
                  field="phone"
                  onEdit={handleEditField}
                  badge={
                    displayPhone ? (
                      displayPhoneVerified ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            fontSize: "0.72rem",
                            color: "var(--accent, #009956)",
                            fontWeight: 600,
                          }}
                        >
                          <CheckCircle2 size={12} /> Верифіковано
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            fontSize: "0.72rem",
                            color: "#e67e22",
                            fontWeight: 600,
                          }}
                        >
                          <AlertCircle size={12} /> Не верифіковано
                        </span>
                      )
                    ) : null
                  }
                />
                <AccountItem
                  icon={<Lock size={18} />}
                  label="Змінити пароль"
                  field="password"
                  onEdit={handleEditField}
                  isArrow
                />
                <AccountItem
                  icon={<CreditCard size={18} />}
                  label="Спосіб оплати"
                  value={cardDisplay()}
                  field="payment"
                  onEdit={handleEditField}
                  isArrow
                />
                <AccountItem
                  icon={<MapPin size={18} />}
                  label="Адреса"
                  value={displayAddress || "Не вказано"}
                  field="address"
                  onEdit={handleEditField}
                  isArrow
                />

                <div
                  className="account-item logout-item"
                  role="button"
                  tabIndex={0}
                  onClick={handleLogout}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleLogout();
                    }
                  }}
                >
                  <div className="item-info">
                    <span className="account-item-icon">
                      <LogOut size={18} />
                    </span>
                    <div>
                      <strong>Вийти з акаунту</strong>
                    </div>
                  </div>
                  <span
                    className="account-item-icon"
                    style={{ color: "var(--text-3)" }}
                  >
                    <ChevronRight size={18} />
                  </span>
                </div>
              </div>
            </div>
          )}

          {tab === "orders" && (
            <div id="orders-content">
              <h1>Ваші замовлення</h1>
              <OrderHistory token={token!} />
            </div>
          )}
        </section>
      </main>

      {/* ── EditModal: тільки ім'я та адреса ── */}
      {editField && (
        <EditModal
          field={editField}
          currentValue={editField === "name" ? displayName : displayAddress}
          onSave={(val) => handleSave(editField, val)}
          onClose={() => setEditField(null)}
          saving={isSaving}
        />
      )}

      {/* ── Підтвердження пароля (гейт для phone / email / payment) ── */}
      {confirmPwOpen && token && confirmPwAction && (
        <ConfirmPasswordModal
          token={token}
          description={CONFIRM_DESCRIPTIONS[confirmPwAction]}
          onSuccess={handleConfirmPasswordSuccess}
          onClose={() => {
            setConfirmPwOpen(false);
            setConfirmPwAction(null);
          }}
        />
      )}

      {/* ── Зміна пароля (з OTP якщо є верифікований телефон) ── */}
      {changePasswordOpen && token && (
        <ChangePasswordModal
          token={token}
          hasVerifiedPhone={displayPhoneVerified}
          maskedPhone={getMaskedPhone()}
          onSuccess={() => {
            setChangePasswordOpen(false);
          }}
          onClose={() => setChangePasswordOpen(false)}
          onForgotPassword={() => {
            setChangePasswordOpen(false);
            setForgotOpen(true);
          }}
        />
      )}

      {/* ── Зміна email (відкривається після підтвердження пароля) ── */}
      {changeEmailOpen && token && (
        <ChangeEmailModal
          token={token}
          onClose={() => {
            setChangeEmailOpen(false);
            if (user) setDisplayEmail(user.email ?? "");
          }}
        />
      )}

      {/* ── Зміна телефону (відкривається після підтвердження пароля) ── */}
      {phoneModalOpen && token && (
        <PhoneVerifyModal
          token={token}
          currentPhone={displayPhone}
          onSuccess={(updatedUser) => {
            // Мерджимо з поточним user щоб не втратити has_password та інші поля
            const merged = { ...user!, ...updatedUser };
            saveAuth(token!, merged);
            setDisplayPhone(merged.phone ?? "");
            setDisplayPhoneVerified(merged.phone_verified ?? false);
            setPhoneModalOpen(false);
            toast.success("Телефон підтверджено ✓");
          }}
          onClose={() => setPhoneModalOpen(false)}
        />
      )}

      {/* ── Платіжна картка (відкривається після підтвердження пароля) ── */}
      {paymentModalOpen && token && (
        <PaymentCardModal
          token={token}
          onSuccess={(updatedUser) => {
            const merged = { ...user!, ...updatedUser };
            saveAuth(token!, merged);
            setDisplayCardMasked(
              merged.card_masked_pan ?? merged.payment ?? "",
            );
            setDisplayCardType(merged.card_type ?? "");
            setPaymentModalOpen(false);
            toast.success("Картку збережено ✓");
          }}
          onClose={() => setPaymentModalOpen(false)}
        />
      )}

      {/* ── Скидання пароля ── */}
      {forgotOpen && (
        <ForgotPasswordModal onClose={() => setForgotOpen(false)} />
      )}

      <Footer />
    </>
  );
}
