"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  CreditCard,
  Lock,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Wifi,
} from "lucide-react";
import {
  apiDevBindCard,
  apiGetMe,
  apiInitWayForPay,
  getFriendlyErrorMessage,
} from "@/lib/api";
import type { UserInfo, WayForPayInitResult } from "@/types";

// Повноцінна навігація POST-формою на сторінку WayForPay (Card Verify)
function submitToWayForPay(url: string, fields: Record<string, string | number>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  form.acceptCharset = "utf-8";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

function useCardNumberMask() {
  const [raw, setRaw] = useState("");
  const formatted = raw
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
  const cardType: "visa" | "mastercard" | "" = raw.startsWith("4")
    ? "visa"
    : /^5[1-5]/.test(raw) || /^2[2-7]/.test(raw)
      ? "mastercard"
      : "";
  return {
    value: formatted,
    raw: raw.replace(/\D/g, ""),
    cardType,
    onChange: (v: string) => setRaw(v.replace(/\D/g, "").slice(0, 16)),
  };
}

function useExpiryMask() {
  const [value, setValue] = useState("");
  function onChange(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 4);
    setValue(d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
  }
  function validate(): string | null {
    if (value.length < 5) return "Введіть дату MM/YY";
    const [mm, yy] = value.split("/").map(Number);
    if ((mm ?? 0) < 1 || (mm ?? 0) > 12) return "Невірний місяць";
    const now = new Date();
    const yr = 2000 + (yy ?? 0);
    if (
      yr < now.getFullYear() ||
      (yr === now.getFullYear() && (mm ?? 0) < now.getMonth() + 1)
    )
      return "Картка прострочена";
    return null;
  }
  return { value, onChange, validate };
}

function CardVisual({
  number,
  expiry,
  cardType,
  flipped,
}: {
  number: string;
  expiry: string;
  cardType: "visa" | "mastercard" | "";
  flipped: boolean;
}) {
  const display = number
    .padEnd(16, "•")
    .replace(/(.{4})/g, "$1 ")
    .trim();
  return (
    <div style={{ perspective: 1000, marginBottom: 22, height: 158 }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.45s cubic-bezier(0.23,1,0.32,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* FRONT */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            borderRadius: 14,
            background:
              "linear-gradient(140deg,#1c2f1c 0%,#0e1f0f 55%,#162616 100%)",
            border: "1px solid color-mix(in srgb, var(--accent) 18%, transparent)",
            boxShadow:
              "0 8px 28px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.04)",
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -50,
              right: -50,
              width: 170,
              height: 170,
              borderRadius: "50%",
              background:
                "radial-gradient(circle,color-mix(in srgb, var(--accent) 9%, transparent) 0%,transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 32,
                height: 24,
                borderRadius: 4,
                background:
                  "linear-gradient(135deg,#c0983a 0%,#e0c060 40%,#c0983a 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 10,
                  borderRadius: 2,
                  border: "1px solid rgba(0,0,0,0.18)",
                  background: "linear-gradient(135deg,#b08830,#d0b050)",
                }}
              />
            </div>
            <Wifi
              size={16}
              color="rgba(255,255,255,0.25)"
              style={{ transform: "rotate(90deg)" }}
            />
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Courier New',monospace",
                fontSize: "0.98rem",
                letterSpacing: "0.17em",
                color: "rgba(255,255,255,0.82)",
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              {display}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "0.56rem",
                    color: "rgba(255,255,255,0.3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 2,
                  }}
                >
                  Дійсна до
                </div>
                <div
                  style={{
                    fontFamily: "'Courier New',monospace",
                    fontSize: "0.85rem",
                    color: "rgba(255,255,255,0.65)",
                    fontWeight: 600,
                  }}
                >
                  {expiry || "MM/YY"}
                </div>
              </div>
              {cardType === "visa" && (
                <span
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    fontStyle: "italic",
                    color: "#fff",
                    letterSpacing: 1,
                  }}
                >
                  VISA
                </span>
              )}
              {cardType === "mastercard" && (
                <div style={{ position: "relative", width: 42, height: 26 }}>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: "#EB001B",
                      opacity: 0.88,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: "#F79E1B",
                      opacity: 0.88,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        {/* BACK */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            borderRadius: 14,
            background: "linear-gradient(140deg,#1a2a1a 0%,#0d1f0d 100%)",
            border: "1px solid color-mix(in srgb, var(--accent) 18%, transparent)",
            transform: "rotateY(180deg)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: 36,
              background: "rgba(0,0,0,0.5)",
              margin: "22px 0 14px",
            }}
          />
          <div style={{ padding: "0 20px" }}>
            <div
              style={{
                background: "rgba(255,255,255,0.07)",
                borderRadius: 4,
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <span
                style={{ fontSize: "0.66rem", color: "rgba(255,255,255,0.35)" }}
              >
                CVV
              </span>
              <span
                style={{
                  fontFamily: "monospace",
                  letterSpacing: "0.2em",
                  color: "#fff",
                  fontSize: "0.9rem",
                }}
              >
                •••
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  token: string;
  onSuccess: (u: UserInfo) => void;
  onClose: () => void;
}
type Step = "loading" | "error" | "form" | "wayforpay" | "done";

export default function PaymentCardModal({ token, onSuccess, onClose }: Props) {
  const [step, setStep] = useState<Step>("loading");
  const [wpData, setWpData] = useState<WayForPayInitResult | null>(null);
  const [netError, setNetError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const initialized = useRef(false);

  const cardNumber = useCardNumberMask();
  const expiry = useExpiryMask();
  const [cvv, setCvv] = useState("");
  const [cvvFocused, setCvvFocused] = useState(false);

  function doInit() {
    apiInitWayForPay(token)
      .then((d) => {
        setWpData(d);
        setStep(d.mock ? "form" : "wayforpay");
      })
      .catch((e) => {
        setNetError(e instanceof Error ? e.message : "Помилка підключення");
        setStep("error");
      });
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    doInit();
  }, []); // eslint-disable-line

  function handleGoToWayForPay() {
    if (!wpData || wpData.mock) return;
    setRedirecting(true);
    submitToWayForPay(wpData.verify.url, wpData.verify.fields);
  }

  function handleRetry() {
    setStep("loading");
    setNetError("");
    initialized.current = false;
    doInit();
  }

  async function handleSave() {
    if (cardNumber.raw.length < 16)
      return setFormError("Введіть повний номер картки");
    const ee = expiry.validate();
    if (ee) return setFormError(ee);
    if (cvv.length < 3) return setFormError("Введіть CVV");
    setFormError("");
    setSaving(true);
    try {
      await apiDevBindCard(cardNumber.raw, token);
      const fresh = await apiGetMe(token);
      setStep("done");
      setTimeout(() => onSuccess(fresh), 1800);
    } catch (err: unknown) {
      setFormError(getFriendlyErrorMessage(err, "Не вдалося зберегти картку"));
    } finally {
      setSaving(false);
    }
  }

  const lbl: React.CSSProperties = {
    display: "block",
    fontSize: "0.78rem",
    color: "var(--text-3,#888)",
    marginBottom: 5,
    fontWeight: 500,
  };
  const inp: React.CSSProperties = { width: "100%" };

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pm-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-content"
        style={{ maxWidth: 392, padding: "26px 26px 22px" }}
      >
        <button className="modal-close" onClick={onClose} aria-label="Закрити">
          <X size={15} />
        </button>

        {step === "loading" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                border: "3px solid color-mix(in srgb, var(--accent) 12%, transparent)",
                borderTopColor: "var(--accent,#009956)",
                animation: "pm-spin .75s linear infinite",
                margin: "0 auto 14px",
              }}
            />
            <p
              style={{
                color: "var(--text-3,#888)",
                fontSize: "0.88rem",
                margin: 0,
              }}
            >
              Підключаємо платіжний сервіс…
            </p>
          </div>
        )}

        {step === "error" && (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: "50%",
                background: "rgba(229,57,53,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 14px",
              }}
            >
              <AlertCircle size={24} color="#e53935" />
            </div>
            <h3
              id="pm-title"
              style={{ margin: "0 0 6px", fontSize: "1.08rem" }}
            >
              Не вдалося підключитись
            </h3>
            <p
              style={{
                color: "var(--text-3,#888)",
                fontSize: "0.86rem",
                margin: "0 0 22px",
                lineHeight: 1.5,
              }}
            >
              {netError}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={onClose}
              >
                Закрити
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleRetry}
              >
                <RefreshCw size={13} style={{ marginRight: 5 }} />
                Спробувати знову
              </button>
            </div>
          </div>
        )}

        {step === "form" && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <CreditCard size={18} color="var(--accent,#009956)" />
              </div>
              <div>
                <h3
                  id="pm-title"
                  style={{
                    margin: "0 0 2px",
                    fontSize: "1.08rem",
                    fontWeight: 700,
                  }}
                >
                  Додати картку
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.76rem",
                    color: "var(--text-3,#888)",
                  }}
                >
                  CVV не зберігається · SSL захист
                </p>
              </div>
            </div>

            <CardVisual
              number={cardNumber.raw}
              expiry={expiry.value}
              cardType={cardNumber.cardType}
              flipped={cvvFocused}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <div>
                <label style={lbl}>Номер картки</label>
                <input
                  className="modal-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="0000  0000  0000  0000"
                  value={cardNumber.value}
                  onChange={(e) => cardNumber.onChange(e.target.value)}
                  maxLength={19}
                  style={inp}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div>
                  <label style={lbl}>Дійсна до</label>
                  <input
                    className="modal-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="MM/YY"
                    value={expiry.value}
                    onChange={(e) => expiry.onChange(e.target.value)}
                    maxLength={5}
                    style={inp}
                  />
                </div>
                <div>
                  <label style={lbl}>CVV / CVC</label>
                  <input
                    className="modal-input"
                    type="password"
                    inputMode="numeric"
                    placeholder="•••"
                    value={cvv}
                    onFocus={() => setCvvFocused(true)}
                    onBlur={() => setCvvFocused(false)}
                    onChange={(e) =>
                      setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    maxLength={4}
                    style={inp}
                  />
                </div>
              </div>
            </div>

            {formError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 10,
                  color: "#e53935",
                  fontSize: "0.83rem",
                }}
              >
                <AlertCircle size={13} />
                {formError}
              </div>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                margin: "13px 0",
                color: "var(--text-3,#999)",
                fontSize: "0.74rem",
              }}
            >
              <Lock size={10} />
              <span>Захищено шифруванням TLS 1.3</span>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-secondary"
                style={{ flexShrink: 0, padding: "0 16px" }}
                onClick={onClose}
              >
                Скасувати
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Збереження…" : "Зберегти картку (тест)"}
              </button>
            </div>
          </>
        )}

        {step === "wayforpay" && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: 16,
              }}
            >
              <ShieldCheck size={20} color="var(--accent,#009956)" />
              <h3 id="pm-title" style={{ margin: 0, fontSize: "1.08rem" }}>
                Прив&apos;язка картки
              </h3>
            </div>
            <p
              style={{
                color: "var(--text-2)",
                fontSize: "0.9rem",
                lineHeight: 1.5,
                margin: "0 0 18px",
              }}
            >
              Дані картки вводяться на захищеній сторінці WayForPay — ми їх не
              бачимо і не зберігаємо. Кошти не списуються: WayForPay лише
              перевіряє картку, після чого вас буде повернено назад.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-secondary"
                style={{ flexShrink: 0, padding: "0 16px" }}
                onClick={onClose}
                disabled={redirecting}
              >
                Скасувати
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleGoToWayForPay}
                disabled={redirecting}
              >
                {redirecting ? "Переходимо…" : "Перейти до WayForPay"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0 12px" }}>
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: "50%",
                background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 14px",
                animation: "pm-pop .4s cubic-bezier(0.175,.885,.32,1.275)",
              }}
            >
              <CheckCircle2 size={34} color="var(--accent,#009956)" />
            </div>
            <h3 style={{ margin: "0 0 5px", fontSize: "1.1rem" }}>
              Картку збережено!
            </h3>
            <p
              style={{
                color: "var(--text-3,#888)",
                fontSize: "0.86rem",
                margin: 0,
              }}
            >
              {cardNumber.cardType === "visa"
                ? "Visa"
                : cardNumber.cardType === "mastercard"
                  ? "MasterCard"
                  : "Картка"}{" "}
              ••••&nbsp;{cardNumber.raw.slice(-4) || "----"}
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pm-spin { to { transform: rotate(360deg); } }
        @keyframes pm-pop  { 0%{transform:scale(.5);opacity:0} 100%{transform:scale(1);opacity:1} }
      `}</style>
    </div>
  );
}
