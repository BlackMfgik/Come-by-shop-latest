"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import {
  apiGetProducts,
  apiGetProduct,
  apiCreateProduct,
  apiUpdateProduct,
  apiDeleteProduct,
  apiToggleProductVisibility,
  apiUploadImage,
  apiGetAdminOrders,
  apiUpdateOrderStatus,
  getFriendlyErrorMessage,
  type AdminOrder,
  type ProductInput,
} from "@/lib/api";
import type { Product } from "@/types";
import {
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  X,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  User,
  Clock,
  MapPin,
  CheckCircle2,
  Truck,
  PackageCheck,
  XCircle,
  ChefHat,
  Package,
  ImageIcon,
  X as XIcon,
} from "lucide-react";
import ConfirmDeleteModal from "@/components/modals/ConfirmDeleteModal";
import { cldUrl, STATIC_IMAGES } from "@/lib/cld";

// ─── Типи ─────────────────────────────────────────────────────────────────────

const ORDER_STATUSES = [
  "В обробці",
  "Оплачено",
  "Новий",
  "Підтверджено",
  "Готується",
  "Передано кур'єру",
  "В дорозі",
  "Доставлено",
  "Скасовано",
] as const;

type OrderStatus = (typeof ORDER_STATUSES)[number];


// ─── Конфіг статусів ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  OrderStatus,
  {
    color: string;
    bg: string;
    icon: React.ReactNode;
    next: OrderStatus[];
  }
> = {
  "В обробці": {
    color: "#1565C0",
    bg: "rgba(21,101,192,0.12)",
    icon: <Clock size={13} />,
    next: ["Підтверджено", "Скасовано"],
  },
  Оплачено: {
    color: "#2E7D32",
    bg: "rgba(46,125,50,0.12)",
    icon: <CheckCircle2 size={13} />,
    next: ["Підтверджено", "Скасовано"],
  },
  Новий: {
    color: "#1565C0",
    bg: "rgba(21,101,192,0.12)",
    icon: <Clock size={13} />,
    next: ["Підтверджено", "Скасовано"],
  },
  Підтверджено: {
    color: "#7B1FA2",
    bg: "rgba(123,31,162,0.12)",
    icon: <CheckCircle2 size={13} />,
    next: ["Готується", "Скасовано"],
  },
  Готується: {
    color: "#E65100",
    bg: "rgba(230,81,0,0.12)",
    icon: <ChefHat size={13} />,
    next: ["Передано кур'єру", "Скасовано"],
  },
  "Передано кур'єру": {
    color: "#00695C",
    bg: "rgba(0,105,92,0.12)",
    icon: <Package size={13} />,
    next: ["В дорозі"],
  },
  "В дорозі": {
    color: "#009956",
    bg: "rgba(0,153,86,0.12)",
    icon: <Truck size={13} />,
    next: ["Доставлено"],
  },
  Доставлено: {
    color: "#2E7D32",
    bg: "rgba(46,125,50,0.15)",
    icon: <PackageCheck size={13} />,
    next: [],
  },
  Скасовано: {
    color: "#C62828",
    bg: "rgba(198,40,40,0.12)",
    icon: <XCircle size={13} />,
    next: [],
  },
};

function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status as OrderStatus] ?? {
      color: "#888",
      bg: "rgba(128,128,128,0.1)",
      icon: <Clock size={13} />,
      next: [],
    }
  );
}

// ─── Стилі AdminPanel ─────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  description: "",
  weight: "",
  price: "",
  imageUrl: "",
  category: "",
  customCategory: "",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-2)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "0.5px solid var(--border-2)",
  background: "var(--surface-2)",
  color: "var(--text)",
  fontSize: 14,
};

function ActionBtn({
  onClick,
  children,
  title,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 30,
        height: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        border: `0.5px solid ${danger ? "#FCEBEB" : "var(--border-2)"}`,
        background: "transparent",
        color: danger ? "#A32D2D" : "var(--text-2)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = getStatusConfig(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 99,
        color: cfg.color,
        background: cfg.bg,
      }}
    >
      {cfg.icon} {status}
    </span>
  );
}

// ─── OrderCard ────────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onStatusChange,
  updating,
}: {
  order: AdminOrder;
  onStatusChange: (id: number, status: OrderStatus) => void;
  updating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cfg = getStatusConfig(order.status);
  const nextStatuses = cfg.next as OrderStatus[];

  return (
    <div
      style={{
        border: "0.5px solid var(--border)",
        borderRadius: 14,
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          cursor: "pointer",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flex: 1,
            minWidth: 0,
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: "var(--text)",
              }}
            >
              Замовлення #{order.id}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-2)",
                marginTop: 2,
              }}
            >
              {new Date(order.createdAt).toLocaleString("uk-UA")}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
            }}
          >
            <User
              size={12}
              style={{ color: "var(--text-2)", flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: 13,
                color: "var(--text-2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {order.userName}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: 14,
              color: "var(--text)",
            }}
          >
            {Number(order.total).toFixed(2)} ₴
          </span>
          <StatusBadge status={order.status} />
          {open ? (
            <ChevronUp
              size={16}
              style={{ color: "var(--text-2)" }}
            />
          ) : (
            <ChevronDown
              size={16}
              style={{ color: "var(--text-2)" }}
            />
          )}
        </div>
      </div>

      {open && (
        <div
          style={{
            borderTop: "0.5px solid var(--border)",
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--surface-2)",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
              }}
            >
              <User
                size={13}
                style={{ color: "var(--text-2)" }}
              />
              <span
                style={{ color: "var(--text)", fontWeight: 500 }}
              >
                {order.userName}
              </span>
            </div>
            {order.userPhone && (
              <a
                href={`tel:${order.userPhone}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: "var(--text-2)",
                  textDecoration: "none",
                }}
              >
                <Phone size={13} />
                {order.userPhone}
              </a>
            )}
            {order.userAddress && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: "var(--text-2)",
                }}
              >
                <MapPin size={13} />
                {order.userAddress}
              </span>
            )}
            {order.userEmail && (
              <a
                href={`mailto:${order.userEmail}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: "var(--text-2)",
                  textDecoration: "none",
                }}
              >
                <Mail size={13} />
                {order.userEmail}
              </a>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            {order.items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 0",
                  borderBottom:
                    idx < order.items.length - 1
                      ? "0.5px solid var(--border)"
                      : "none",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "var(--text)" }}>
                  {item.productName}
                  <span
                    style={{
                      color: "var(--text-2)",
                      marginLeft: 6,
                    }}
                  >
                    × {item.quantity}
                  </span>
                </span>
                <span
                  style={{
                    fontWeight: 500,
                    color: "var(--text)",
                  }}
                >
                  {(Number(item.price) * item.quantity).toFixed(2)} ₴
                </span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 10,
                paddingTop: 10,
                borderTop: "0.5px solid var(--border-2)",
                fontWeight: 700,
                fontSize: 14,
                color: "var(--text)",
              }}
            >
              <span>Разом</span>
              <span>{Number(order.total).toFixed(2)} ₴</span>
            </div>
          </div>

          {nextStatuses.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-2)",
                  marginBottom: 8,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Змінити статус:
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {nextStatuses.map((s) => {
                  const sCfg = getStatusConfig(s);
                  const isCancelBtn = s === "Скасовано";
                  return (
                    <button
                      key={s}
                      disabled={updating}
                      onClick={() => onStatusChange(order.id, s)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "7px 14px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 600,
                        border: `1.5px solid ${isCancelBtn ? "rgba(198,40,40,0.4)" : sCfg.color}`,
                        background: isCancelBtn ? "transparent" : sCfg.bg,
                        color: sCfg.color,
                        opacity: updating ? 0.5 : 1,
                        transition: "opacity 0.15s",
                      }}
                    >
                      {sCfg.icon} {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {nextStatuses.length === 0 && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--text-2)",
                fontStyle: "italic",
              }}
            >
              <StatusBadge status={order.status} />— статус фінальний, зміна
              недоступна
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Фільтр замовлень ─────────────────────────────────────────────────────────

function OrderFilters({
  activeFilter,
  onChange,
  counts,
}: {
  activeFilter: string;
  onChange: (s: string) => void;
  counts: Record<string, number>;
}) {
  const all = ["Усі", ...ORDER_STATUSES];
  return (
    <div
      style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}
    >
      {all.map((s) => {
        const count =
          s === "Усі"
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : (counts[s] ?? 0);
        const isActive = activeFilter === s;
        const cfg = s !== "Усі" ? getStatusConfig(s) : null;

        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px",
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              border: isActive
                ? `1.5px solid ${cfg?.color ?? "var(--text)"}`
                : "0.5px solid var(--border-2)",
              background: isActive
                ? (cfg?.bg ?? "var(--surface-2)")
                : "transparent",
              color: isActive
                ? (cfg?.color ?? "var(--text)")
                : "var(--text-2)",
            }}
          >
            {s !== "Усі" && cfg?.icon}
            {s}
            {count > 0 && (
              <span
                style={{
                  background: isActive
                    ? cfg?.color
                    : "var(--border-2)",
                  color: isActive ? "#fff" : "var(--text-2)",
                  borderRadius: 99,
                  padding: "0 5px",
                  fontSize: 10,
                  lineHeight: "16px",
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── OrdersTab ────────────────────────────────────────────────────────────────

function OrdersTab({ token }: { token: string }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [filter, setFilter] = useState("Усі");

  async function load() {
    setLoading(true);
    try {
      setOrders(await apiGetAdminOrders(token));
    } catch {
      toast.error("Не вдалося завантажити замовлення");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleStatusChange(orderId: number, newStatus: OrderStatus) {
    setUpdatingId(orderId);
    try {
      const updated = await apiUpdateOrderStatus(orderId, newStatus, token);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      toast(`Замовлення #${orderId} → ${newStatus}`);
    } catch {
      toast.error("Не вдалося змінити статус");
    } finally {
      setUpdatingId(null);
    }
  }

  const counts = useMemo(
    () =>
      orders.reduce<Record<string, number>>((acc, o) => {
        acc[o.status] = (acc[o.status] ?? 0) + 1;
        return acc;
      }, {}),
    [orders],
  );

  const filtered =
    filter === "Усі" ? orders : orders.filter((o) => o.status === filter);

  if (loading) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "3rem",
          color: "var(--text-2)",
          fontSize: 14,
        }}
      >
        Завантаження замовлень…
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--text-2)" }}>
          Всього замовлень:{" "}
          <strong style={{ color: "var(--text)" }}>
            {orders.length}
          </strong>
        </div>
        <button
          onClick={load}
          style={{
            fontSize: 12,
            padding: "5px 12px",
            borderRadius: 8,
            cursor: "pointer",
            border: "0.5px solid var(--border-2)",
            background: "transparent",
            color: "var(--text-2)",
          }}
        >
          ↻ Оновити
        </button>
      </div>

      <OrderFilters
        activeFilter={filter}
        onChange={setFilter}
        counts={counts}
      />

      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            color: "var(--text-2)",
            fontSize: 14,
            border: "0.5px dashed var(--border-2)",
            borderRadius: 14,
          }}
        >
          <ShoppingBag size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div>Немає замовлень зі статусом «{filter}»</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={handleStatusChange}
              updating={updatingId === order.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AdminPanel (головний) ────────────────────────────────────────────────────

type AdminTab = "products" | "orders";

export default function AdminPanel() {
  const { user, token, _hasHydrated } = useAuthStore();

  const [activeTab, setActiveTab] = useState<AdminTab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<"file" | "url">("file");
  const [urlInput, setUrlInput] = useState("");

  const categories = useMemo(() => {
    const cats = products.map((p) => p.category).filter(Boolean) as string[];
    return [...new Set(cats)].sort();
  }, [products]);

  const isNewCategory = form.category === "__new__";
  const effectiveCategory = isNewCategory ? form.customCategory : form.category;

  useEffect(() => {
    if (_hasHydrated && user?.admin) load();
  }, [_hasHydrated, user?.admin]);

  if (!_hasHydrated || !user?.admin) return null;

  async function load() {
    setLoading(true);
    try {
      setProducts(await apiGetProducts(undefined, token));
    } catch {
      toast.error("Не вдалося завантажити товари");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const price = parseFloat(form.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Вкажіть коректну ціну");
      return;
    }
    if (!effectiveCategory.trim()) {
      toast.error("Оберіть або введіть категорію");
      return;
    }
    setSaving(true);
    const payload: ProductInput = {
      name: form.name.trim(),
      description: form.description,
      weight: form.weight,
      price,
      image: form.imageUrl,
      category: effectiveCategory.trim(),
    };
    try {
      if (editingId != null) {
        await apiUpdateProduct(editingId, payload, token);
        toast.success("Товар оновлено ✓");
        setEditingId(null);
      } else {
        await apiCreateProduct(payload, token);
        toast.success("Товар додано ✓");
      }
      setForm(EMPTY_FORM);
      await load();
    } catch (err: unknown) {
      toast.error(
        getFriendlyErrorMessage(err, "Помилка при збереженні"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(id: number) {
    try {
      const p = await apiGetProduct(id);
      setForm({
        name: p.name,
        description: p.description ?? "",
        weight: p.weight ?? "",
        price: String(p.price),
        imageUrl: p.image ?? "",
        category: p.category ?? "",
        customCategory: "",
      });
      setEditingId(id);
      if (typeof window !== "undefined")
        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error("Не вдалося завантажити товар");
    }
  }

  async function handleDeleteConfirmed(id: number) {
    if (!token) return;
    try {
      await apiDeleteProduct(id, token);
      toast.success("Товар видалено");
      await load();
    } catch {
      toast.error("Не вдалося видалити товар");
    }
  }

  async function handleFileUpload(file: File) {
    if (!token) return;
    setUploading(true);
    try {
      const url = await apiUploadImage(file, token);
      setForm((prev) => ({ ...prev, imageUrl: url }));
      toast.success("Зображення завантажено ✓");
    } catch (err: unknown) {
      toast.error(getFriendlyErrorMessage(err, "Помилка завантаження"));
    } finally {
      setUploading(false);
    }
  }

  async function handleToggle(p: Product) {
    if (!token) return;
    try {
      const updated = await apiToggleProductVisibility(p.id, !p.hidden, token);
      setProducts((prev) =>
        prev.map((item) => (item.id === p.id ? updated : item)),
      );
      toast(p.hidden ? "Товар показано" : "Товар приховано");
    } catch {
      toast.error("Не вдалося змінити видимість");
    }
  }

  const f =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div
      style={{
        maxWidth: 1400,
        margin: "0 auto",
        // Відступ під фіксовану шапку, інакше вкладки ховаються під нею
        padding: "calc(72px * var(--scale) + 2rem) 1.5rem 2rem",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: "2rem",
          borderBottom: "0.5px solid var(--border)",
          paddingBottom: 0,
        }}
      >
        {(
          [
            { id: "products", label: "Товари", icon: <Package size={15} /> },
            {
              id: "orders",
              label: "Замовлення",
              icon: <ShoppingBag size={15} />,
            },
          ] as { id: AdminTab; label: string; icon: React.ReactNode }[]
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              background: "transparent",
              border: "none",
              borderBottom:
                activeTab === tab.id
                  ? "2px solid var(--text)"
                  : "2px solid transparent",
              color:
                activeTab === tab.id
                  ? "var(--text)"
                  : "var(--text-2)",
              marginBottom: -1,
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "products" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "380px 1fr",
            gap: "1.5rem",
            alignItems: "start",
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "0.5px solid var(--border)",
              borderRadius: 16,
              position: "sticky",
              top: "1rem",
              padding: "1.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1.25rem",
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>
                {editingId != null ? "Редагування товару" : "Новий товар"}
              </h2>
              {editingId != null && (
                <button
                  onClick={() => {
                    setEditingId(null);
                    setForm(EMPTY_FORM);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "0.5px solid var(--border-2)",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--text-2)",
                  }}
                >
                  <X size={14} /> Скасувати
                </button>
              )}
            </div>

            <form id="admin-product-form" onSubmit={handleSubmit}>
              <div
                style={{
                  display: "flex",
                  gap: "1.5rem",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.9rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      gridColumn: "1 / -1",
                    }}
                  >
                    <label style={labelStyle}>Назва товару *</label>
                    <input
                      placeholder="Наприклад: Суші-бокс"
                      required
                      value={form.name}
                      onChange={f("name")}
                      style={inputStyle}
                    />
                  </div>

                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <label style={labelStyle}>Категорія</label>
                    <select
                      value={form.category}
                      onChange={f("category")}
                      style={inputStyle}
                    >
                      <option value="">— без категорії —</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__new__">+ Нова категорія...</option>
                    </select>
                  </div>

                  {isNewCategory ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <label style={labelStyle}>Назва нової категорії</label>
                      <input
                        placeholder="Введи назву"
                        value={form.customCategory}
                        onChange={f("customCategory")}
                        style={inputStyle}
                      />
                    </div>
                  ) : (
                    <div />
                  )}

                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <label style={labelStyle}>Ціна (₴) *</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      required
                      value={form.price}
                      onChange={f("price")}
                      style={inputStyle}
                    />
                  </div>

                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <label style={labelStyle}>Вага / об&apos;єм</label>
                    <input
                      placeholder="Наприклад: 300г"
                      value={form.weight}
                      onChange={f("weight")}
                      style={inputStyle}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      gridColumn: "1 / -1",
                    }}
                  >
                    <label style={labelStyle}>Опис</label>
                    <textarea
                      placeholder="Короткий опис товару"
                      value={form.description}
                      onChange={f("description")}
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>

                  <div
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                      paddingTop: 4,
                    }}
                  >
                    <button
                      type="submit"
                      disabled={saving}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 22px",
                        borderRadius: 10,
                        border: "none",
                        background: "var(--text)",
                        color: "var(--surface)",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: saving ? "not-allowed" : "pointer",
                        opacity: saving ? 0.6 : 1,
                      }}
                    >
                      <Plus size={15} />
                      {saving
                        ? "Зберігаємо..."
                        : editingId != null
                          ? "Зберегти зміни"
                          : "Додати товар"}
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    flexShrink: 0,
                    width: 180,
                  }}
                >
                  <label style={labelStyle}>Фото товару</label>

                  <div style={{ display: "flex", gap: 4 }}>
                    {(["file", "url"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setUploadMode(mode)}
                        style={{
                          flex: 1,
                          padding: "5px 0",
                          borderRadius: 7,
                          border: "1.5px solid",
                          borderColor:
                            uploadMode === mode
                              ? "var(--text)"
                              : "var(--border)",
                          background:
                            uploadMode === mode
                              ? "var(--text)"
                              : "transparent",
                          color:
                            uploadMode === mode
                              ? "var(--surface)"
                              : "var(--text-2)",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          letterSpacing: "0.04em",
                          transition: "all .15s",
                        }}
                      >
                        {mode === "file" ? "FILE" : "URL"}
                      </button>
                    ))}
                  </div>

                  {uploadMode === "file" ? (
                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        height: 160,
                        border: "2px dashed var(--border)",
                        borderRadius: 12,
                        cursor: uploading ? "not-allowed" : "pointer",
                        background: form.imageUrl
                          ? "transparent"
                          : "var(--surface-2)",
                        overflow: "hidden",
                        position: "relative",
                        transition: "border-color .2s",
                        opacity: uploading ? 0.6 : 1,
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) handleFileUpload(file);
                      }}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: "none" }}
                        disabled={uploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file);
                          e.target.value = "";
                        }}
                      />
                      {form.imageUrl ? (
                        <img
                          src={form.imageUrl}
                          alt="preview"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: 10,
                          }}
                        />
                      ) : uploading ? (
                        <>
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              border: "3px solid var(--border)",
                              borderTop: "3px solid var(--text)",
                              borderRadius: "50%",
                              animation: "spin 0.8s linear infinite",
                            }}
                          />
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--text-2)",
                            }}
                          >
                            Завантаження...
                          </span>
                        </>
                      ) : (
                        <>
                          <ImageIcon
                            size={26}
                            style={{ color: "var(--text-2)" }}
                          />
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--text-2)",
                              textAlign: "center",
                              lineHeight: 1.4,
                            }}
                          >
                            Натисни або
                            <br />
                            перетягни файл
                            <br />
                            <span style={{ opacity: 0.6 }}>
                              JPG PNG WebP ≤10MB
                            </span>
                          </span>
                        </>
                      )}
                    </label>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {form.imageUrl && (
                        <img
                          src={form.imageUrl}
                          alt="preview"
                          style={{
                            width: "100%",
                            height: 130,
                            objectFit: "cover",
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                          }}
                        />
                      )}
                      <input
                        placeholder="https://res.cloudinary.com/..."
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        style={{ ...inputStyle, fontSize: 11 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (urlInput.trim()) {
                            setForm((prev) => ({
                              ...prev,
                              imageUrl: urlInput.trim(),
                            }));
                            toast.success("Посилання збережено ✓");
                          }
                        }}
                        style={{
                          padding: "7px 0",
                          borderRadius: 8,
                          border: "none",
                          background: "var(--text)",
                          color: "var(--surface)",
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        Зберегти URL
                      </button>
                    </div>
                  )}

                  {form.imageUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, imageUrl: "" }))
                      }
                      style={{
                        padding: "5px 0",
                        borderRadius: 7,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text-2)",
                        fontSize: 11,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      <XIcon size={11} /> Видалити фото
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "0.5px solid var(--border)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "1rem 1.5rem",
                borderBottom: "0.5px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>
                Товари
              </h2>
              <span
                style={{ fontSize: 13, color: "var(--text-2)" }}
              >
                {products.length} позицій
              </span>
            </div>
            {loading ? (
              <div
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  color: "var(--text-2)",
                  fontSize: 14,
                }}
              >
                Завантаження...
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{ background: "var(--surface-2)" }}
                  >
                    {[
                      "Фото",
                      "Назва",
                      "Категорія",
                      "Ціна",
                      "Статус",
                      "Дії",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 16px",
                          textAlign: "left",
                          fontWeight: 500,
                          color: "var(--text-2)",
                          borderBottom:
                            "0.5px solid var(--border)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom:
                          "0.5px solid var(--border)",
                        opacity: p.hidden ? 0.5 : 1,
                      }}
                    >
                      <td style={{ padding: "10px 16px" }}>
                        <img
                          src={p.image || cldUrl(STATIC_IMAGES.noImage)}
                          alt={p.name}
                          style={{
                            width: 40,
                            height: 40,
                            objectFit: "cover",
                            borderRadius: 8,
                          }}
                        />
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          fontWeight: 500,
                          color: "var(--text)",
                        }}
                      >
                        {p.name}
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          color: "var(--text-2)",
                        }}
                      >
                        {p.category ? (
                          <span
                            style={{
                              background: "var(--surface-2)",
                              padding: "2px 8px",
                              borderRadius: 99,
                              fontSize: 11,
                            }}
                          >
                            {p.category}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        style={{
                          padding: "10px 16px",
                          color: "var(--text)",
                        }}
                      >
                        {Number(p.price).toFixed(2)} ₴
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 99,
                            background: p.hidden
                              ? "var(--surface-2)"
                              : "#EAF3DE",
                            color: p.hidden
                              ? "var(--text-2)"
                              : "#3B6D11",
                          }}
                        >
                          {p.hidden ? "Приховано" : "Видимий"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <ActionBtn
                            onClick={() => handleEdit(p.id)}
                            title="Редагувати"
                          >
                            <Pencil size={14} />
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => handleToggle(p)}
                            title={p.hidden ? "Показати" : "Приховати"}
                          >
                            {p.hidden ? (
                              <Eye size={14} />
                            ) : (
                              <EyeOff size={14} />
                            )}
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => setDeleteTarget(p)}
                            title="Видалити"
                            danger
                          >
                            <Trash2 size={14} />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === "orders" && token && <OrdersTab token={token} />}

      {deleteTarget && (
        <ConfirmDeleteModal
          productName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDeleteConfirmed(deleteTarget.id)}
        />
      )}
    </div>
  );
}
