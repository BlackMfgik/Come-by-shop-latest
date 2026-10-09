"use client";

import { useRef } from "react";

interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}

export default function OtpInput({
  value,
  onChange,
  disabled,
  hasError,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // Порожня клітинка всередині коду = пробіл, щоб цифри не зсувались
  const cells = () => Array.from({ length: 6 }, (_, k) => value[k] ?? " ");
  const emit = (chars: string[]) => onChange(chars.join("").trimEnd());

  function handleChange(i: number, v: string) {
    const digit = v.replace(/\D/g, "").slice(-1);
    const chars = cells();
    chars[i] = digit || " ";
    emit(chars);
    if (digit && i < 5) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const chars = cells();
      if (chars[i] !== " ") {
        chars[i] = " ";
        emit(chars);
      } else if (i > 0) {
        chars[i - 1] = " ";
        emit(chars);
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < 5) {
      refs.current[i + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const digits = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    onChange(digits);
    const nextFocus = Math.min(digits.length, 5);
    refs.current[nextFocus]?.focus();
  }

  return (
    <>
      <style>{`
        .otp-box {
          width: 44px;
          height: 52px;
          padding: 0;
          box-sizing: border-box;
          text-align: center;
          font-size: 1.5rem;
          font-weight: 700;
          font-family: 'Courier New', monospace;
          line-height: 52px;
          border-radius: 10px;
          border: 2px solid var(--border, #444);
          background: var(--input-bg, var(--bg-2, #1e1e1e));
          color: var(--text-1, inherit);
          outline: none;
          transition: border-color 0.15s;
          -webkit-appearance: none;
        }
        .otp-box.filled  { border-color: var(--accent, #009956); }
        .otp-box.error   { border-color: var(--red, #e53935); }
        .otp-box:focus   { border-color: var(--accent, #009956); box-shadow: 0 0 0 3px rgba(0,153,86,0.15); }
        .otp-box:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Цифра ${i + 1}`}
            maxLength={1}
            value={(value[i] ?? "").trim()}
            disabled={disabled}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className={[
              "otp-box",
              value[i]?.trim() && !hasError ? "filled" : "",
              hasError ? "error" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        ))}
      </div>
    </>
  );
}
