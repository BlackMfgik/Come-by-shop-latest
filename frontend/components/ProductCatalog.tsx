"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import { useSearchStore } from "@/store/searchStore.ts";
import { toast } from "sonner";
import {
  apiGetProducts,
  apiGetProduct,
  apiCreateProduct,
  apiUpdateProduct,
  apiDeleteProduct,
  apiToggleProductVisibility,
  apiUploadImage,
  getFriendlyErrorMessage,
  type ProductInput,
} from "@/lib/api";
import type { Product } from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  X,
  Plus,
  Upload,
  X as XIcon,
} from "lucide-react";
import SkeletonCard from "@/components/ui/SkeletonCard";
import EmptyState from "@/components/ui/EmptyState";
import CategoryFilter from "@/components/ui/CategoryFilter";
import { cldUrl, STATIC_IMAGES } from "@/lib/cld";
import ProductQuickViewModal from "@/components/modals/ProductQuickViewModal";
import ConfirmDeleteModal from "@/components/modals/ConfirmDeleteModal";

// ─── Fuzzy search ────────────────────────────────────────────────────────────

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function fuzzyWindowMatch(text: string, q: string): boolean {
  if (q.length < 3) return false;
  for (let len = Math.max(2, q.length - 1); len <= q.length + 1; len++) {
    for (let i = 0; i <= text.length - len; i++) {
      if (editDistance(text.slice(i, i + len), q) <= 1) return true;
    }
  }
  return false;
}

function scoreProduct(p: Product, query: string): number {
  if (!query.trim()) return 1;
  const q = query.toLowerCase().trim();
  const name = (p.name ?? "").toLowerCase();
  const desc = (p.description ?? "").toLowerCase();
  const cat = (p.category ?? "").toLowerCase();
  if (name.includes(q)) return 1.0;
  if (desc.includes(q) || cat.includes(q)) return 0.85;
  const combined = name + " " + desc + " " + cat;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => combined.includes(w))) return 0.75;
  if (!q.includes(" ") && fuzzyWindowMatch(name, q)) return 0.55;
  return 0;
}

function fuzzyFilter(items: Product[], query: string): Product[] {
  if (!query.trim()) return items;
  return items
    .map((item) => ({ item, score: scoreProduct(item, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

const PAGE_SIZE = 8;

// Cloudinary віддає зменшену копію під потрібну ширину замість оригіналу
function productImage(src: string | undefined, width: number): string {
  if (!src) return cldUrl(STATIC_IMAGES.noImage, { w: width });
  const marker = "res.cloudinary.com/";
  const uploadSeg = "/image/upload/";
  if (!src.includes(marker) || !src.includes(uploadSeg)) return src;
  const [head, tail] = src.split(uploadSeg);
  if (/^(f_|q_|w_|c_|h_)/.test(tail)) return src;
  return `${head}${uploadSeg}f_auto,q_auto,c_limit,w_${width}/${tail}`;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  weight: "",
  price: "",
  imageUrl: "",
  category: "",
  customCategory: "",
};

interface Props {
  initialProducts: Product[];
  searchQuery?: string;
  category?: string;
  limit?: number;
  hideFilter?: boolean;
}

export default function ProductCatalog({
  initialProducts,
  searchQuery = "",
  category,
  limit,
  hideFilter = false,
}: Props) {
  const { user, token } = useAuthStore();
  const { addItem } = useCartStore();
  const { liveQuery } = useSearchStore();
  const queryClient = useQueryClient();

  const effectiveQuery = liveQuery || searchQuery;
  const isAdmin = user?.admin ?? false;

  const [page, setPage] = useState(1);
  const [activeCategory, setActiveCategory] = useState(category ?? "");
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [overlayProductId, setOverlayProductId] = useState<number | null>(null);

  // Admin form state
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<"file" | "url">("file");
  const [urlInput, setUrlInput] = useState("");

  const isNewCategory = form.category === "__new__";
  const effectiveCategory = isNewCategory ? form.customCategory : form.category;

  const productsKey = ["products", isAdmin ? "admin" : "public"];

  const {
    data: products = initialProducts,
    isLoading,
    isError,
  } = useQuery({
    queryKey: productsKey,
    queryFn: () => apiGetProducts(undefined, isAdmin ? token : null),
    initialData: isAdmin ? undefined : initialProducts,
    staleTime: 60_000,
  });

  // Скидаємо пагінацію при зміні фільтрів (без setState в useMemo)
  const filterKey = `${effectiveQuery}|${activeCategory}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["products"] });

  const createMutation = useMutation({
    mutationFn: (payload: ProductInput) =>
      apiCreateProduct(payload, token!),
    onSuccess: () => {
      toast.success("Товар додано ✓");
      setForm(EMPTY_FORM);
      setAdminOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error(getFriendlyErrorMessage(err, "Помилка при збереженні")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProductInput }) =>
      apiUpdateProduct(id, payload, token!),
    onSuccess: () => {
      toast.success("Товар оновлено ✓");
      setForm(EMPTY_FORM);
      setEditingId(null);
      setAdminOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error(getFriendlyErrorMessage(err, "Помилка при збереженні")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDeleteProduct(id, token!),
    onSuccess: () => {
      toast.success("Товар видалено");
      invalidate();
    },
    onError: () => toast.error("Не вдалося видалити товар"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, hidden }: { id: number; hidden: boolean }) =>
      apiToggleProductVisibility(id, hidden, token!),
    // Оптимістичне оновлення — відразу показуємо зміну в UI без очікування сервера
    onMutate: async ({ id, hidden }) => {
      await queryClient.cancelQueries({ queryKey: productsKey });
      const prev = queryClient.getQueryData<Product[]>(productsKey);
      queryClient.setQueryData<Product[]>(productsKey, (old = []) =>
        old.map((p) => (p.id === id ? { ...p, hidden } : p)),
      );
      return { prev };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Product[]>(productsKey, (old = []) =>
        old.map((p) => (p.id === updated.id ? updated : p)),
      );
      toast.success(updated.hidden ? "Товар приховано" : "Товар показано");
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(productsKey, ctx.prev);
      toast.error("Не вдалося змінити видимість");
    },
    onSettled: () => setOverlayProductId(null),
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  // ─── Handlers ─────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(form.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Вкажіть коректну ціну");
      return;
    }
    if (!effectiveCategory.trim()) {
      toast.error("Оберіть або введіть категорію");
      return;
    }
    const payload: ProductInput = {
      name: form.name.trim(),
      description: form.description,
      weight: form.weight,
      price,
      image: form.imageUrl,
      category: effectiveCategory.trim(),
    };
    if (editingId != null) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
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
      setAdminOpen(true);
      if (typeof window !== "undefined")
        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error("Не вдалося завантажити товар");
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

  const f =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // ─── Фільтрація і пагінація ───────────────────────────────────────────────

  const categories = useMemo(() => {
    const cats = products.map((p) => p.category).filter(Boolean) as string[];
    return [...new Set(cats)].sort();
  }, [products]);

  const categoryFiltered = products.filter((p) => {
    if (!isAdmin && p.hidden) return false;
    return !activeCategory || p.category === activeCategory;
  });

  const filtered = fuzzyFilter(categoryFiltered, effectiveQuery);
  const pageSize = limit ?? PAGE_SIZE;
  const totalPages = limit
    ? 1
    : Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const hasMore = limit != null && filtered.length > limit;

  function openCard(p: Product) {
    if (isAdmin) {
      setOverlayProductId(overlayProductId === p.id ? null : p.id);
    } else {
      setQuickViewProduct(p);
    }
  }

  function goToPage(p: number) {
    setPage(p);
    document
      .getElementById("catalog")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ─── Стилі ────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 10,
    border: "0.5px solid var(--border-2)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: 14,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-2)",
  };

  return (
    <>
      {isAdmin && (
        <div
          style={{
            maxWidth: 1400,
            margin: "calc(80px * var(--scale)) auto 0",
            padding: "0 calc(24px * var(--scale))",
          }}
        >
          {!adminOpen && (
            <button
              onClick={() => {
                setAdminOpen(true);
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 10,
                border: "1.5px solid var(--accent)",
                background: "transparent",
                color: "var(--accent)",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                marginBottom: "1rem",
              }}
            >
              <Plus size={16} /> Додати товар
            </button>
          )}

          {adminOpen && (
            <div
              style={{
                background: "var(--surface)",
                border: "0.5px solid var(--border)",
                borderRadius: 16,
                padding: "0.6rem 1.5rem 1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text)",
                  }}
                >
                  {editingId != null ? "Редагування товару" : "Новий товар"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAdminOpen(false);
                    setEditingId(null);
                    setForm(EMPTY_FORM);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 7,
                    border: "0.5px solid var(--border-2)",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--text-2)",
                  }}
                >
                  <X size={12} /> Скасувати
                </button>
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
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      flexShrink: 0,
                      width: 140,
                    }}
                  >
                    <label style={labelStyle}>Фото</label>

                    <label
                      style={{
                        position: "relative",
                        width: 140,
                        height: 140,
                        borderRadius: 12,
                        border: form.imageUrl
                          ? "1px solid var(--border)"
                          : "2px dashed var(--border)",
                        background: form.imageUrl
                          ? "transparent"
                          : "var(--surface-2, var(--surface))",
                        cursor: uploading ? "not-allowed" : "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        overflow: "hidden",
                        opacity: uploading ? 0.6 : 1,
                        transition: "border-color .15s",
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
                        <>
                          <img
                            src={form.imageUrl}
                            alt="preview"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setForm((p) => ({ ...p, imageUrl: "" }));
                            }}
                            style={{
                              position: "absolute",
                              top: 4,
                              right: 4,
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              border: "none",
                              background: "rgba(0,0,0,0.65)",
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            <XIcon size={10} />
                          </button>
                        </>
                      ) : uploading ? (
                        <>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              border: "2.5px solid var(--border)",
                              borderTop: "2.5px solid var(--accent)",
                              borderRadius: "50%",
                              animation: "spin 0.8s linear infinite",
                            }}
                          />
                          <span
                            style={{ fontSize: 11, color: "var(--text-2)" }}
                          >
                            Завантаження...
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload
                            size={22}
                            style={{ color: "var(--text-2)" }}
                          />
                          <span
                            style={{
                              fontSize: 10,
                              color: "var(--text-2)",
                              textAlign: "center",
                              lineHeight: 1.4,
                            }}
                          >
                            Перетягни
                            <br />
                            або натисни
                          </span>
                        </>
                      )}
                    </label>

                    <div style={{ display: "flex", gap: 4 }}>
                      {(["file", "url"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setUploadMode(mode)}
                          style={{
                            flex: 1,
                            padding: "4px 0",
                            borderRadius: 6,
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: "pointer",
                            border: "1px solid",
                            borderColor:
                              uploadMode === mode
                                ? "var(--accent)"
                                : "var(--border-2)",
                            background:
                              uploadMode === mode
                                ? "var(--accent)"
                                : "transparent",
                            color:
                              uploadMode === mode ? "#fff" : "var(--text-2)",
                            letterSpacing: "0.03em",
                            transition: "all .15s",
                          }}
                        >
                          {mode === "file" ? "FILE" : "URL"}
                        </button>
                      ))}
                    </div>

                    {uploadMode === "url" && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <input
                          placeholder="https://..."
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          style={{ ...inputStyle, fontSize: 11 }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (urlInput.trim()) {
                              setForm((p) => ({
                                ...p,
                                imageUrl: urlInput.trim(),
                              }));
                              toast.success("✓");
                            }
                          }}
                          style={{
                            padding: "6px 0",
                            borderRadius: 7,
                            border: "none",
                            background: "var(--accent)",
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: "pointer",
                          }}
                        >
                          Зберегти URL
                        </button>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      flex: 1,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.75rem",
                    }}
                  >
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <label style={labelStyle}>Назва *</label>
                      <input
                        placeholder="Наприклад: Суші-бокс"
                        required
                        value={form.name}
                        onChange={f("name")}
                        style={inputStyle}
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <label style={labelStyle}>Категорія</label>
                      <select
                        value={form.category}
                        onChange={f("category")}
                        style={inputStyle}
                      >
                        <option value="">— без —</option>
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        <option value="__new__">+ Нова...</option>
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
                        <label style={labelStyle}>Назва нової</label>
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
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
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
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <label style={labelStyle}>Вага / об&apos;єм</label>
                      <input
                        placeholder="300г"
                        value={form.weight}
                        onChange={f("weight")}
                        style={inputStyle}
                      />
                    </div>

                    <div
                      style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <label style={labelStyle}>Опис</label>
                      <input
                        placeholder="Короткий опис товару"
                        value={form.description}
                        onChange={
                          f(
                            "description",
                          ) as React.ChangeEventHandler<HTMLInputElement>
                        }
                        style={inputStyle}
                      />
                    </div>

                    <div
                      style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        type="submit"
                        disabled={saving}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "9px 22px",
                          borderRadius: 10,
                          border: "none",
                          background: "var(--accent)",
                          color: "#fff",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: saving ? "not-allowed" : "pointer",
                          opacity: saving ? 0.6 : 1,
                        }}
                      >
                        <Plus size={15} />
                        {saving
                          ? "Збереження..."
                          : editingId != null
                            ? "Зберегти"
                            : "Додати товар"}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {!hideFilter && categories.length > 0 && (
        <div
          style={
            isAdmin ? undefined : { marginTop: "calc(80px * var(--scale))" }
          }
        >
          <CategoryFilter
            categories={categories}
            active={activeCategory}
            onChange={setActiveCategory}
          />
        </div>
      )}

      <section
        className="catalog"
        id="catalog"
        style={
          (!hideFilter && categories.length > 0) || isAdmin
            ? { marginTop: 0 }
            : undefined
        }
      >
        {isLoading &&
          Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}

        {!isLoading && isError && (
          <p className="error-wrap">Не вдалося завантажити товари</p>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div style={{ gridColumn: "1/-1" }}>
            <EmptyState
              title={
                effectiveQuery ? "Нічого не знайдено" : "Товарів поки немає"
              }
              subtitle={
                effectiveQuery
                  ? `За запитом «${effectiveQuery}» нічого не знайдено`
                  : "Поверніться пізніше — скоро буде більше~"
              }
            />
          </div>
        )}

        {!isLoading &&
          paginated.map((p, index) => {
            const isHidden = p.hidden === true;
            const showOverlay = isAdmin && overlayProductId === p.id;

            return (
              <div
                className="product-card"
                data-id={p.id}
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={p.name}
                style={{
                  position: "relative",
                  cursor: "pointer",
                  opacity: isHidden && isAdmin ? 0.55 : 1,
                }}
                onClick={() => openCard(p)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openCard(p);
                  }
                }}
              >
                <div className="product-img">
                  <img
                    src={productImage(p.image, 480)}
                    alt={p.name}
                    loading={index < 4 ? "eager" : "lazy"}
                    decoding="async"
                    width={480}
                    height={480}
                  />
                </div>
                <div className="product-info">
                  <div>
                    <b>{p.name}</b>
                    <div className="product-weight">{p.weight}</div>
                  </div>
                  <div className="product-bottom">
                    <span className="product-price">
                      {Number(p.price).toFixed(2)} ₴
                    </span>
                    <button
                      className="add-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isAdmin) return;
                        addItem(
                          p.name,
                          p.price,
                          productImage(p.image, 160),
                          p.description || "",
                          p.id,
                        );
                        toast.success(`${p.name} додано до кошика 🛒`);
                      }}
                    >
                      <span>+</span> Додати
                    </button>
                  </div>
                </div>

                {showOverlay && (
                  <div
                    className="admin-card-overlay"
                    onClick={(e) => {
                      if (e.target === e.currentTarget)
                        setOverlayProductId(null);
                    }}
                  >
                    <button
                      className="admin-overlay-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOverlayProductId(null);
                        handleEdit(p.id);
                      }}
                    >
                      <Pencil size={14} /> Змінити
                    </button>
                    <button
                      className="admin-overlay-btn admin-overlay-btn--danger"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOverlayProductId(null);
                        setDeleteTarget(p);
                      }}
                    >
                      <Trash2 size={14} /> Видалити
                    </button>
                    <button
                      className="admin-overlay-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMutation.mutate({ id: p.id, hidden: !p.hidden });
                      }}
                      disabled={toggleMutation.isPending}
                    >
                      {isHidden ? (
                        <>
                          <Eye size={14} /> Показати
                        </>
                      ) : (
                        <>
                          <EyeOff size={14} /> Приховати
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
      </section>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            onClick={() => goToPage(safePage - 1)}
            disabled={safePage === 1}
            aria-label="Попередня сторінка"
          >
            <ChevronLeft size={18} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              className={`pagination-btn${p === safePage ? " active" : ""}`}
              onClick={() => goToPage(p)}
              aria-label={`Сторінка ${p}`}
              aria-current={p === safePage ? "page" : undefined}
            >
              {p}
            </button>
          ))}
          <button
            className="pagination-btn"
            onClick={() => goToPage(safePage + 1)}
            disabled={safePage === totalPages}
            aria-label="Наступна сторінка"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {hasMore && (
        <div className="catalog-more">
          <Link href="/menu" className="catalog-more-btn">
            Переглянути всі товари
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </div>
      )}

      {!limit && filtered.length > 0 && (
        <p className="pagination-info">
          Показано {(safePage - 1) * PAGE_SIZE + 1}–
          {Math.min(safePage * PAGE_SIZE, filtered.length)} з {filtered.length}{" "}
          товарів
        </p>
      )}

      {!isAdmin && quickViewProduct && (
        <ProductQuickViewModal
          product={quickViewProduct}
          onClose={() => setQuickViewProduct(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          productName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            deleteMutation.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}
