interface Props {
  categories: string[];
  active: string;
  onChange: (cat: string) => void;
  variant?: "chips" | "sidebar";
  counts?: Record<string, number>;
  total?: number;
}

export default function CategoryFilter({
  categories,
  active,
  onChange,
  variant = "chips",
  counts,
  total,
}: Props) {
  const sidebar = variant === "sidebar";
  const btn = (key: string, label: string, count?: number) => (
    <button
      key={key || "all"}
      type="button"
      className={`category-filter-btn${active === key ? " active" : ""}`}
      aria-pressed={active === key}
      onClick={() => onChange(key)}
    >
      <span>{label}</span>
      {sidebar && count != null && (
        <span className="category-filter-count">{count}</span>
      )}
    </button>
  );

  return (
    <div
      className={
        sidebar ? "category-filter category-filter--sidebar" : "category-filter"
      }
    >
      {sidebar && <span className="catalog-sidebar-title">Категорії</span>}
      {btn("", "Всі", total)}
      {categories.map((cat) => btn(cat, cat, counts?.[cat]))}
    </div>
  );
}
