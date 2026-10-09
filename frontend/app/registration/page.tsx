"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BaseModal from "@/components/modals/BaseModal";
import { User, Mail, Lock, Eye, EyeOff, MailCheck } from "lucide-react";
import GoogleIcon from "@/components/GoogleIcon";
import { useFingerprint } from "@/hooks/useFingerprint";
import {
  apiRegister,
  apiResendRegistrationCode,
  apiVerifyRegistration,
  getFriendlyErrorMessage,
} from "@/lib/api";

// ── Індикатор сили пароля ───────────────────────────────────────────────────

function getStrength(pw: string) {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Слабкий", color: "#e74c3c" };
  if (score <= 2) return { score, label: "Середній", color: "#e67e22" };
  if (score <= 3) return { score, label: "Хороший", color: "#f1c40f" };
  return { score, label: "Надійний", color: "#27ae60" };
}

function PasswordStrength({ password }: { password: string }) {
  const { score, label, color } = getStrength(password);
  const bars = 4;
  const filled = Math.ceil((score / 5) * bars);
  return (
    <div className="pw-strength">
      <div className="pw-bars">
        {Array.from({ length: bars }, (_, i) => (
          <div
            key={i}
            className="pw-bar"
            style={{ background: i < filled ? color : "var(--border)" }}
          />
        ))}
      </div>
      <span className="pw-label" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

// ── Модалка підтвердження email ─────────────────────────────────────────────

interface VerifyModalProps {
  email: string;
  pendingRegistrationId: number;
  deviceId: string;
  password: string;
  onClose: () => void;
  onSuccess: () => void;
}

function EmailVerifyModal({
  email,
  pendingRegistrationId,
  deviceId,
  password,
  onClose,
  onSuccess,
}: VerifyModalProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const code = digits.join("");

  function startCooldown() {
    setCooldown(60);
    timerRef.current = setInterval(() => {
      setCooldown((v) => {
        if (v <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;
    const next = Array(6).fill("");
    pasted.split("").forEach((ch, i) => {
      next[i] = ch;
    });
    setDigits(next);
    inputsRef.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function handleVerify() {
    if (code.length !== 6) {
      setError("Введіть 6-значний код");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiVerifyRegistration(pendingRegistrationId, code, deviceId);
      const result = await signIn("credentials", {
        email,
        password,
        deviceId,
        redirect: false,
      });
      if (!result || result.error) {
        setError(
          "Пошту підтверджено, але автоматичний вхід не вдався. Спробуйте увійти вручну.",
        );
        return;
      }
      onSuccess();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Невірний код"));
      setDigits(Array(6).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendLoading(true);
    setError("");
    try {
      await apiResendRegistrationCode(pendingRegistrationId);
      startCooldown();
      setDigits(Array(6).fill(""));
      inputsRef.current[0]?.focus();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Помилка надсилання. Спробуйте ще раз."));
      return;
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <BaseModal
      onClose={onClose}
      maxWidth={420}
      aria-labelledby="registration-email-verify-title"
    >
        <div style={{ textAlign: "center", marginBottom: "1rem" }}>
          <MailCheck size={44} color="var(--accent)" />
        </div>

        <h2
          id="registration-email-verify-title"
          className="modal-title"
          style={{ textAlign: "center" }}
        >
          Підтвердіть пошту
        </h2>

        <p
          style={{
            textAlign: "center",
            color: "var(--text-secondary)",
            fontSize: "0.9rem",
            marginBottom: "1.5rem",
          }}
        >
          На вашу пошту було відправлено код. Введіть його тут:{" "}
          <strong style={{ color: "var(--text)" }}>{email}</strong>
        </p>

        {/* OTP поля */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            justifyContent: "center",
            marginBottom: "1rem",
          }}
          onPaste={handlePaste}
        >
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputsRef.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              style={{
                width: 44,
                height: 52,
                textAlign: "center",
                fontSize: "1.25rem",
                fontWeight: 600,
                border: "1.5px solid var(--border)",
                borderRadius: 8,
                background: "var(--bg-secondary)",
                color: "var(--text)",
                outline: "none",
              }}
            />
          ))}
        </div>

        {error && (
          <p
            style={{
              color: "#e74c3c",
              textAlign: "center",
              marginBottom: "0.75rem",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="button"
          className="register-button"
          style={{ width: "100%", marginBottom: "0.75rem" }}
          onClick={handleVerify}
          disabled={loading || code.length !== 6}
        >
          {loading ? "Перевірка..." : "Підтвердити"}
        </button>

        <button
          type="button"
          style={{
            width: "100%",
            padding: "0.65rem",
            background: "transparent",
            border: "1.5px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-secondary)",
            fontSize: "0.875rem",
            cursor: cooldown > 0 || resendLoading ? "not-allowed" : "pointer",
            opacity: cooldown > 0 || resendLoading ? 0.6 : 1,
          }}
          onClick={handleResend}
          disabled={resendLoading || cooldown > 0}
        >
          {cooldown > 0
            ? `Надіслати знову (${cooldown}с)`
            : resendLoading
              ? "Надсилання..."
              : "Надіслати код знову"}
          </button>
    </BaseModal>
  );
}

// ── Сторінка реєстрації ─────────────────────────────────────────────────────

export default function RegistrationPage() {
  const router = useRouter();
  const { deviceId } = useFingerprint();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Стан після реєстрації — показуємо модалку
  const [verifyState, setVerifyState] = useState<{
    pendingRegistrationId: number;
    email: string;
    password: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPasswordError("");

    if (!name.trim()) return setError("Введіть ваше ім'я");
    if (!email.trim()) return setError("Введіть email");
    if (password.length < 6)
      return setPasswordError("Пароль має бути не менше 6 символів");
    if (password !== confirm) return setError("Паролі не співпадають");

    setLoading(true);
    try {
      const data = await apiRegister(
        email.trim(),
        password,
        name.trim(),
        deviceId ?? "unknown",
      );
      // Показуємо модалку підтвердження
      setVerifyState({
        pendingRegistrationId: data.pendingRegistrationId,
        email: email.trim(),
        password,
      });
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Помилка реєстрації. Спробуйте ще раз."));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: "/account" });
  }

  return (
    <>
      <Header />
      <main className="register-section">
        <div className="register-box">
          <h2 className="register-title">Створити акаунт</h2>

          <form onSubmit={handleSubmit} className="register-form">
            {/* Ім'я */}
            <div className="register-field">
              <label htmlFor="regName">Ім&apos;я</label>
              <div className="register-input-wrap">
                <User size={16} className="register-icon" />
                <input
                  id="regName"
                  type="text"
                  placeholder="Ваше ім'я"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            </div>

            {/* Email */}
            <div className="register-field">
              <label htmlFor="regEmail">Email</label>
              <div className="register-input-wrap">
                <Mail size={16} className="register-icon" />
                <input
                  id="regEmail"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Пароль */}
            <div className="register-field">
              <label htmlFor="regPassword">Пароль</label>
              <div className="register-input-wrap">
                <Lock size={16} className="register-icon" />
                <input
                  id="regPassword"
                  type={showPw ? "text" : "password"}
                  placeholder="Мінімум 6 символів"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (e.target.value.length >= 6) setPasswordError("");
                  }}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="register-eye"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label="Показати пароль"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {password && <PasswordStrength password={password} />}
              {passwordError && (
                <span className="register-hint error">{passwordError}</span>
              )}
            </div>

            {/* Підтвердження */}
            <div className="register-field">
              <label htmlFor="regConfirm">Підтвердіть пароль</label>
              <div className="register-input-wrap">
                <Lock size={16} className="register-icon" />
                <input
                  id="regConfirm"
                  type={showCf ? "text" : "password"}
                  placeholder="Повторіть пароль"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="register-eye"
                  onClick={() => setShowCf((v) => !v)}
                  aria-label="Показати підтвердження"
                >
                  {showCf ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirm && password !== confirm && (
                <span className="register-hint error">
                  Паролі не співпадають
                </span>
              )}
              {confirm && password === confirm && (
                <span className="register-hint success">
                  ✓ Паролі співпадають
                </span>
              )}
            </div>

            {error && <p className="register-error">{error}</p>}

            <button
              className="register-button"
              type="submit"
              disabled={loading}
            >
              {loading ? "Реєстрація..." : "Зареєструватися"}
            </button>

            <div className="google-login">
              <button
                id="google-login-btn"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
              >
                <GoogleIcon size={20} />
                {googleLoading
                  ? "Перенаправляємо..."
                  : "Зареєструватися через Google"}
              </button>
            </div>
          </form>

          <div className="register-links">
            Вже є акаунт? <Link href="/login">Увійти</Link>
          </div>
        </div>
      </main>
      <Footer />

      {verifyState && (
        <EmailVerifyModal
          email={verifyState.email}
          pendingRegistrationId={verifyState.pendingRegistrationId}
          deviceId={deviceId ?? "unknown"}
          password={verifyState.password}
          onClose={() => setVerifyState(null)}
          onSuccess={() => {
            router.push("/");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
