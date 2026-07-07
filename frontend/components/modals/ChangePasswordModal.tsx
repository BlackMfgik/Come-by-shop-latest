"use client";

/**
 * components/modals/ChangePasswordModal.tsx
 *
 * Зміна пароля — двокроковий флоу:
 *
 * Step 1: старий пароль + новий + підтвердження
 * Step 2: OTP-код на верифікований телефон (якщо phone_verified)
 *         або одразу успіх (якщо телефон не верифіковано)
 *
 * 🔌 Нові ендпоінти (step 2 з телефоном):
 *   POST /api/auth/password-change/request  → перевіряє старий пароль, надсилає OTP
 *   POST /api/auth/password-change/confirm  → перевіряє OTP, зберігає новий пароль
 *
 * Без телефону використовується існуючий:
 *   PUT /api/auth/password
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, Eye, EyeOff, ShieldCheck, RefreshCw } from "lucide-react";
import Countdown, { type CountdownRenderProps } from "react-countdown";
import { toast } from "sonner";

import BaseModal from "./BaseModal";
import OtpInput from "@/components/ui/OtpInput";
import {
  apiChangePassword,
  apiRequestPasswordChange,
  apiConfirmPasswordChange,
  getFriendlyErrorMessage,
} from "@/lib/api";

// ── Схеми ─────────────────────────────────────────────────────────────────────

const step1Schema = z
  .object({
    oldPassword: z.string().min(1, "Введіть поточний пароль"),
    newPassword: z
      .string()
      .min(6, "Новий пароль — мінімум 6 символів")
      .max(100, "Пароль занадто довгий"),
    confirm: z.string().min(1, "Підтвердіть новий пароль"),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: "Паролі не співпадають",
    path: ["confirm"],
  });

const otpSchema = z.object({
  code: z
    .string()
    .length(6, "Код — 6 цифр")
    .regex(/^\d{6}$/, "Тільки цифри"),
});

type Step1Data = z.infer<typeof step1Schema>;
type OtpData = z.infer<typeof otpSchema>;

const RESEND_COOLDOWN = 60;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  /** Чи є підтверджений телефон — якщо так, показуємо OTP крок */
  hasVerifiedPhone: boolean;
  /** Маскований номер для підказки: "+380 ** *** ** 67" */
  maskedPhone?: string;
  onSuccess: () => void;
  onClose: () => void;
  onForgotPassword?: () => void;
}

// ── Таймер повторного відправлення ────────────────────────────────────────────

function ResendTimer({
  timerKey,
  seconds,
  onResend,
  loading,
}: {
  timerKey: number;
  seconds: number;
  onResend: () => void;
  loading: boolean;
}) {
  const target = Date.now() + seconds * 1000;

  function renderer({ seconds: s, completed }: CountdownRenderProps) {
    if (completed) {
      return (
        <button
          type="button"
          disabled={loading}
          onClick={onResend}
          style={{
            background: "none",
            border: "none",
            color: "var(--accent, #009956)",
            cursor: "pointer",
            fontSize: "0.9rem",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <RefreshCw size={14} />
          Надіслати повторно
        </button>
      );
    }
    return (
      <span style={{ color: "var(--text-3, #888)", fontSize: "0.9rem" }}>
        Повторно через {s}с
      </span>
    );
  }

  return (
    <div style={{ textAlign: "center", marginTop: 14 }}>
      <Countdown key={timerKey} date={target} renderer={renderer} />
    </div>
  );
}

// ── Компонент ─────────────────────────────────────────────────────────────────

export default function ChangePasswordModal({
  token,
  hasVerifiedPhone,
  maskedPhone,
  onSuccess,
  onClose,
  onForgotPassword,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [pendingPasswords, setPendingPasswords] = useState<{
    old: string;
    new: string;
  } | null>(null);
  const [timerKey, setTimerKey] = useState(0);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  // ── Step 1 форма ─────────────────────────────────────────────────────────────

  const step1 = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
  });

  // ── Step 2 OTP форма ─────────────────────────────────────────────────────────

  const otpForm = useForm<OtpData>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: "" },
  });
  const code = otpForm.watch("code");

  // ── Хендлери ─────────────────────────────────────────────────────────────────

  async function handleStep1(data: Step1Data) {
    if (!hasVerifiedPhone) {
      // Без телефону — одразу міняємо пароль через існуючий ендпоінт
      try {
        await apiChangePassword(data.oldPassword, data.newPassword, token);
        toast.success("Пароль змінено ✓");
        onSuccess();
      } catch (err) {
        step1.setError("oldPassword", {
          message:
            err instanceof Error && err.message.includes("400")
              ? "Невірний поточний пароль"
              : getFriendlyErrorMessage(err, "Помилка мережі"),
        });
      }
      return;
    }

    // З телефоном — надсилаємо запит і переходимо до OTP
    try {
      await apiRequestPasswordChange(data.oldPassword, data.newPassword, token);
      setPendingPasswords({ old: data.oldPassword, new: data.newPassword });
      setStep(2);
    } catch (err) {
      step1.setError("oldPassword", {
        message:
          err instanceof Error && err.message.includes("400")
            ? "Невірний поточний пароль"
            : getFriendlyErrorMessage(err, "Помилка мережі"),
      });
    }
  }

  async function handleResend() {
    if (!pendingPasswords) return;
    try {
      await apiRequestPasswordChange(
        pendingPasswords.old,
        pendingPasswords.new,
        token,
      );
      setTimerKey((k) => k + 1);
      otpForm.setValue("code", "");
    } catch {
      otpForm.setError("code", {
        message: "Помилка відправки. Спробуйте ще раз.",
      });
    }
  }

  async function handleOtp(data: OtpData) {
    try {
      await apiConfirmPasswordChange(data.code, token);
      toast.success("Пароль змінено ✓");
      onSuccess();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const msg = getFriendlyErrorMessage(err, "Невірний або застарілий код");
      otpForm.setError("code", { message: msg });
      otpForm.setValue("code", "");
      // 410 = сесія протермінувалась — повертаємо на крок 1
      if (status === 410) {
        setStep(1);
        setPendingPasswords(null);
      }
    }
  }

  // ── Рендер ───────────────────────────────────────────────────────────────────

  return (
    <BaseModal
      onClose={onClose}
      disableOutsideClick
      maxWidth={400}
      aria-labelledby="change-pw-title"
    >
      <div className="modal-icon-wrap modal-icon-accent">
        {step === 1 ? (
          <Lock size={28} color="var(--accent, #009956)" />
        ) : (
          <ShieldCheck size={28} color="var(--accent, #009956)" />
        )}
      </div>

      {/* ── Крок 1: паролі ── */}
      {step === 1 && (
        <form
          onSubmit={step1.handleSubmit(handleStep1)}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <h3 id="change-pw-title" style={{ margin: "0 0 4px" }}>
            Зміна пароля
          </h3>
          <p className="modal-subtitle">
            Введіть поточний та новий пароль
            {hasVerifiedPhone && <> — потім підтвердіть кодом з SMS</>}
          </p>

          {/* Поточний пароль */}
          <div style={{ position: "relative" }}>
            <input
              type={showOld ? "text" : "password"}
              placeholder="Поточний пароль"
              className="modal-input"
              autoFocus
              aria-invalid={!!step1.formState.errors.oldPassword}
              {...step1.register("oldPassword")}
            />
            <button
              type="button"
              onClick={() => setShowOld((v) => !v)}
              aria-label={showOld ? "Сховати пароль" : "Показати пароль"}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-2, #aaa)",
                display: "flex",
              }}
            >
              {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {step1.formState.errors.oldPassword && (
            <p className="modal-error-text">
              {step1.formState.errors.oldPassword.message}
            </p>
          )}

          {/* Новий пароль */}
          <div style={{ position: "relative" }}>
            <input
              type={showNew ? "text" : "password"}
              placeholder="Новий пароль (мін. 6 символів)"
              className="modal-input"
              aria-invalid={!!step1.formState.errors.newPassword}
              {...step1.register("newPassword")}
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? "Сховати пароль" : "Показати пароль"}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-2, #aaa)",
                display: "flex",
              }}
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {step1.formState.errors.newPassword && (
            <p className="modal-error-text">
              {step1.formState.errors.newPassword.message}
            </p>
          )}

          {/* Підтвердження */}
          <input
            type="password"
            placeholder="Підтвердіть новий пароль"
            className="modal-input"
            aria-invalid={!!step1.formState.errors.confirm}
            {...step1.register("confirm")}
          />
          {step1.formState.errors.confirm && (
            <p className="modal-error-text">
              {step1.formState.errors.confirm.message}
            </p>
          )}

          {onForgotPassword && (
            <button
              type="button"
              className="modal-forgot forgot-link"
              onClick={() => {
                onClose();
                onForgotPassword();
              }}
              style={{
                display: "block",
                textAlign: "left",
                fontSize: "0.85rem",
              }}
            >
              Забули поточний пароль?
            </button>
          )}

          <div className="modal-buttons" style={{ marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Скасувати
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={step1.formState.isSubmitting}
            >
              {step1.formState.isSubmitting
                ? hasVerifiedPhone
                  ? "Відправляємо…"
                  : "Зберігаємо…"
                : hasVerifiedPhone
                  ? "Далі →"
                  : "Зберегти"}
            </button>
          </div>
        </form>
      )}

      {/* ── Крок 2: OTP ── */}
      {step === 2 && (
        <form onSubmit={otpForm.handleSubmit(handleOtp)}>
          <h3 id="change-pw-title" style={{ margin: "0 0 6px" }}>
            Підтвердіть зміну
          </h3>
          <p className="modal-subtitle">
            Ми надіслали код на{" "}
            <strong style={{ color: "var(--text-1)" }}>
              {maskedPhone ?? "ваш телефон"}
            </strong>
          </p>

          <OtpInput
            value={code}
            onChange={(v) =>
              otpForm.setValue("code", v, { shouldValidate: false })
            }
            disabled={otpForm.formState.isSubmitting}
            hasError={!!otpForm.formState.errors.code}
          />

          {otpForm.formState.errors.code && (
            <p className="modal-error-text" style={{ textAlign: "center" }}>
              {otpForm.formState.errors.code.message}
            </p>
          )}

          <ResendTimer
            timerKey={timerKey}
            seconds={RESEND_COOLDOWN}
            loading={otpForm.formState.isSubmitting}
            onResend={handleResend}
          />

          <div className="modal-buttons" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setStep(1);
                otpForm.reset();
              }}
            >
              ← Назад
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={code.length < 6 || otpForm.formState.isSubmitting}
            >
              {otpForm.formState.isSubmitting ? "Перевіряємо…" : "Підтвердити"}
            </button>
          </div>
        </form>
      )}
    </BaseModal>
  );
}
