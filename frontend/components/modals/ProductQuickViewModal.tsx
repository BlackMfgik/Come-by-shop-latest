"use client";

import { useState } from "react";
import { X, ZoomIn, ZoomOut, Maximize2, Minus, Plus } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { cldUrl, STATIC_IMAGES } from "@/lib/cld";
import { toast } from "sonner";
import type { Product } from "@/types";

function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <div
      className="lightbox-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="lightbox-controls">
        <button
          className="lightbox-btn"
          onClick={() => setZoomed((z) => !z)}
          aria-label="Масштаб"
        >
          {zoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
        </button>
        <button className="lightbox-btn" onClick={onClose} aria-label="Закрити">
          <X size={18} />
        </button>
      </div>
      <div
        className={`lightbox-img-wrap${zoomed ? " lightbox-zoomed" : ""}`}
        onClick={() => setZoomed((z) => !z)}
      >
        <img src={src} alt={alt} draggable={false} />
      </div>
    </div>
  );
}

interface Props {
  product: Product;
  onClose: () => void;
}

export default function ProductQuickViewModal({ product, onClose }: Props) {
  const { addItem, updateQty } = useCartStore();
  const [lightbox, setLightbox] = useState(false);
  const [qty, setQty] = useState(1);
  const price = Number(product.price);
  const imgSrc = product.image || cldUrl(STATIC_IMAGES.noImage);

  function handleAdd() {
    addItem(
      product.name,
      product.price,
      imgSrc,
      product.description || "",
      product.id,
    );
    if (qty > 1) updateQty(product.name, qty - 1);
    toast.success(
      qty > 1
        ? `${product.name} × ${qty} додано до кошика 🛒`
        : `${product.name} додано до кошика 🛒`,
    );
    onClose();
  }

  return (
    <>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qv-title"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="modal-content quick-view-content">
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Закрити"
          >
            <X size={16} />
          </button>
          <div className="quick-view-grid">
            <div
              className="quick-view-img"
              onClick={() => setLightbox(true)}
              role="button"
              tabIndex={0}
              aria-label="Збільшити фото"
            >
              <img src={imgSrc} alt={product.name} />
              <span className="quick-view-zoom-hint">
                <Maximize2 size={16} />
              </span>
            </div>
            <div className="quick-view-info">
              {product.category && (
                <span className="quick-view-category">{product.category}</span>
              )}
              <h3 id="qv-title" className="quick-view-name">
                {product.name}
              </h3>
              {product.weight && (
                <span className="quick-view-weight">{product.weight}</span>
              )}
              {product.description && (
                <p className="quick-view-desc">{product.description}</p>
              )}
              <div className="quick-view-footer">
                <span className="quick-view-price">
                  {(price * qty).toFixed(2)} ₴
                </span>
                <div className="quick-view-actions">
                  <div className="quick-view-qty" aria-label="Кількість">
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      disabled={qty <= 1}
                      aria-label="Менше"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="qty-value">{qty}</span>
                    <button
                      type="button"
                      className="qty-btn qty-btn--plus"
                      onClick={() => setQty((q) => Math.min(99, q + 1))}
                      aria-label="Більше"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="add-btn quick-view-add"
                    onClick={handleAdd}
                  >
                    <span>+</span> Додати
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {lightbox && (
        <Lightbox
          src={imgSrc}
          alt={product.name}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  );
}
