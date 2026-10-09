"use client";

/**
 * components/modals/PhoneVerifyModal.tsx
 *
 * Модалка зміни / верифікації телефону.
 *
 * Покращення vs оригінал:
 * - BaseModal: drag bug fix + хрестик (Завдання 3)
 * - Zustand persistence: відновлює крок OTP після закриття (Завдання 4)
 * - react-countdown: таймер повторного відправлення (Завдання 5)
 * - React Hook Form + Zod: валідація полів (Завдання 1)
 * - MaskedPhone: замаскований показ поточного номера (Завдання 1)
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Countdown, { type CountdownRenderProps } from "react-countdown";
import { Phone, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import BaseModal from "./BaseModal";
import OtpInput from "@/components/ui/OtpInput";
import {
  useVerificationStore,
  isOtpValid,
  otpSecondsLeft,
} from "@/store/verificationStore";
import {
  phoneSchema,
  otpSchema,
  type PhoneFormData,
  type OtpFormData,
} from "@/lib/schemas";
import {
  apiSendPhoneOtp,
  apiVerifyPhoneOtp,
  getFriendlyErrorMessage,
} from "@/lib/api";
import type { UserInfo } from "@/types";

// ── Константи ─────────────────────────────────────────────────────────────────

const OTP_TTL = 120; // секунд до протермінування OTP
const RESEND_COOLDOWN = 60; // секунд між повторними відправками

// ── Хелпери форматування телефону ───────────────────────────────────────────

/** Витягує локальні 9 цифр (після +380) з будь-якого рядка */
function extractLocal(phone: string): string {
  const d = phone.replace(/\D/g, "");
  const local = d.startsWith("380") ? d.slice(3) : d;
  return local.slice(0, 9);
}

/** Форматує 9 локальних цифр у +380(XX)XXX-XX-XX */
function formatLocal(digits: string): string {
  const d = digits.slice(0, 9);
  let r = "+380(";
  if (d.length === 0) return r;
  r += d.slice(0, 2);
  if (d.length <= 2) return r;
  r += ")";
  r += d.slice(2, 5);
  if (d.length <= 5) return r;
  r += "-";
  r += d.slice(5, 7);
  if (d.length <= 7) return r;
  r += "-";
  r += d.slice(7, 9);
  return r;
}

// ── Таймер (react-countdown renderer) ─────────────────────────────────────────

function ResendTimer({
  seconds,
  onResend,
  loading,
}: {
  seconds: number;
  onResend: () => void;
  loading: boolean;
}) {
  // Фіксуємо момент завершення один раз — інакше таймер скидається при кожному рендері
  const [target] = useState(() => Date.now() + seconds * 1000);

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
      <Countdown date={target} renderer={renderer} />
    </div>
  );
}

// ── Головний компонент ────────────────────────────────────────────────────────

interface Props {
  token: string;
  currentPhone?: string;
  onSuccess: (updatedUser: UserInfo) => void;
  onClose: () => void;
}

type Step = "phone" | "otp" | "done";

export default function PhoneVerifyModal({
  token,
  currentPhone,
  onSuccess,
  onClose,
}: Props) {
  const {
    phone: saved,
    setPhoneOtpSent,
    clearPhoneVerification,
  } = useVerificationStore();

  // ── Визначаємо початковий крок через Zustand persist ─────────────────────

  const hasActiveOtp = saved.otpSent && isOtpValid(saved.expiresAt);
  const initialStep: Step = hasActiveOtp ? "otp" : "phone";
  const initialPhone = hasActiveOtp
    ? (saved.pendingPhone ?? "")
    : (currentPhone ?? "");

  // ── Локальний стан телефонного інпуту ────────────────────────────────────

  const [localDigits, setLocalDigits] = useState(() =>
    extractLocal(initialPhone),
  );

  // ── RHF: форма номера ─────────────────────────────────────────────────────

  const phoneForm = useForm<PhoneFormData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: initialPhone },
  });

  // ── RHF: форма OTP ────────────────────────────────────────────────────────

  const otpForm = useForm<OtpFormData>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: "" },
  });

  const {
    watch: otpWatch,
    setValue: otpSetValue,
    handleSubmit: otpHandleSubmit,
    formState: { errors: otpErrors, isSubmitting: otpSubmitting },
  } = otpForm;
  const otpValue = otpWatch("code");

  // ── Стан кроків (derived від RHF + local state) ───────────────────────────

  const step: Step = hasActiveOtp
    ? initialStep
    : phoneForm.formState.isSubmitSuccessful
      ? "otp"
      : "phone";

  // Авто-підтвердження при 6 цифрах
  useEffect(() => {
    if (/^\d{6}$/.test(otpValue ?? "")) {
      otpHandleSubmit(handleVerify)();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpValue]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSendOtp(data: PhoneFormData, isResend = false) {
    try {
      await apiSendPhoneOtp(data.phone, token);
      setPhoneOtpSent(data.phone, OTP_TTL);
      if (isResend) otpSetValue("code", "");
      toast.success("SMS з кодом відправлено!");
      if (!isResend) {
        phoneForm.reset(data);
      }
    } catch (err: unknown) {
      const msg = getFriendlyErrorMessage(err, "Помилка надсилання SMS");
      phoneForm.setError("phone", { message: msg });
    }
  }

  async function handleVerify(data: OtpFormData) {
    const phone = saved.pendingPhone;
    if (!phone) return;

    try {
      const response = await apiVerifyPhoneOtp(phone, data.code, token);
      clearPhoneVerification();
      toast.success("Телефон підтверджено!");

      // Бекенд може повернути повний UserInfo або { ok: true } (старий формат).
      // В обох випадках передаємо оновлений телефон + phone_verified = true.
      const hasUserData = "email" in response;
      const update = hasUserData
        ? response
        : ({ phone, phone_verified: true } as UserInfo);

      onSuccess(update);
    } catch (err: unknown) {
      const msg = getFriendlyErrorMessage(err, "Невірний код");
      otpForm.setError("code", { message: msg });
      otpSetValue("code", "");
    }
  }

  function handleClose() {
    // НЕ чистимо verificationStore — юзер може повернутись
    onClose();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const resendSeconds = hasActiveOtp
    ? otpSecondsLeft(saved.expiresAt)
    : RESEND_COOLDOWN;

  return (
    <BaseModal
      onClose={handleClose}
      disableOutsideClick // форма з введенням — не закриваємо по кліку на overlay
      maxWidth={400}
      aria-labelledby="phone-modal-title"
    >
      {/* ── Крок 1: введення номера ── */}
      {!hasActiveOtp && !phoneForm.formState.isSubmitSuccessful && (
        <form onSubmit={phoneForm.handleSubmit((data) => handleSendOtp(data))}>
          <div className="modal-icon-wrap modal-icon-accent">
            <Phone size={28} color="var(--accent, #009956)" />
          </div>
          <h3 id="phone-modal-title" style={{ margin: "0 0 6px" }}>
            Номер телефону
          </h3>
          <p className="modal-subtitle">
            Ми надішлемо SMS з кодом підтвердження
          </p>

          {currentPhone && (
            <p
              style={{
                fontSize: 13,
                color: "var(--text-2, #aaa)",
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              Поточний:{" "}
              <strong style={{ fontFamily: "'Courier New', monospace" }}>
                {/* Task 1: показуємо замаскований поточний номер */}
                {maskPhone(currentPhone)}
              </strong>
            </p>
          )}

          <div id="modal-row-single">
            <input
              className="modal-input"
              type="tel"
              inputMode="numeric"
              autoFocus
              aria-invalid={!!phoneForm.formState.errors.phone}
              value={formatLocal(localDigits)}
              onChange={(e) => {
                // Витягуємо тільки цифри з того, що ввів юзер
                const allDigits = e.target.value.replace(/\D/g, "");
                // Відкидаємо префікс 380 який вже є у відображенні
                const local = allDigits.startsWith("380")
                  ? allDigits.slice(3).slice(0, 9)
                  : allDigits.slice(0, 9);
                setLocalDigits(local);
                phoneForm.setValue("phone", "380" + local, {
                  shouldValidate: false,
                });
              }}
            />
          </div>

          {phoneForm.formState.errors.phone && (
            <p className="modal-error-text">
              {phoneForm.formState.errors.phone.message}
            </p>
          )}

          <div className="modal-buttons" style={{ marginTop: 16 }}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={handleClose}
            >
              Скасувати
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={phoneForm.formState.isSubmitting}
            >
              {phoneForm.formState.isSubmitting
                ? "Надсилаємо…"
                : "Надіслати код"}
            </button>
          </div>
        </form>
      )}

      {/* ── Крок 2: введення OTP ── */}
      {(hasActiveOtp || phoneForm.formState.isSubmitSuccessful) && (
        <form onSubmit={otpHandleSubmit(handleVerify)}>
          <div className="modal-icon-wrap modal-icon-accent">
            <ShieldCheck size={28} color="var(--accent, #009956)" />
          </div>
          <h3 id="phone-modal-title" style={{ margin: "0 0 6px" }}>
            Код підтвердження
          </h3>
          <p className="modal-subtitle">
            Введіть код з SMS на{" "}
            <strong
              style={{
                color: "var(--text-1)",
                fontFamily: "'Courier New', monospace",
              }}
            >
              {saved.pendingPhone ?? "ваш номер"}
            </strong>
          </p>

          {/* Task 4: якщо відновлено з persist — підказка */}
          {hasActiveOtp && (
            <p
              style={{
                fontSize: 12,
                color: "var(--accent, #009956)",
                textAlign: "center",
                marginBottom: 8,
                opacity: 0.8,
              }}
            >
              ✓ Ви вже отримали код — просто введіть його
            </p>
          )}

          <OtpInput
            value={otpValue}
            onChange={(v) => otpSetValue("code", v, { shouldValidate: false })}
            disabled={otpSubmitting}
            hasError={!!otpErrors.code}
          />

          {otpErrors.code && (
            <p className="modal-error-text" style={{ textAlign: "center" }}>
              {otpErrors.code.message}
            </p>
          )}

          {/* Task 5: react-countdown таймер */}
          <ResendTimer
            key={saved.expiresAt ?? 0}
            seconds={resendSeconds}
            loading={phoneForm.formState.isSubmitting}
            onResend={() =>
              phoneForm.handleSubmit((data) => handleSendOtp(data, true))()
            }
          />

          <div className="modal-buttons" style={{ marginTop: 16 }}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                clearPhoneVerification();
                phoneForm.reset();
              }}
            >
              Назад
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={otpValue.length < 6 || otpSubmitting}
            >
              {otpSubmitting ? "Перевіряємо…" : "Підтвердити"}
            </button>
          </div>
        </form>
      )}

      {/* ── Крок 3: успіх ── */}
      {/* Показується через onSuccess → батьківський компонент закриває модалку */}
    </BaseModal>
  );
}

// ── Хелпер (локальний) ────────────────────────────────────────────────────────

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("380") && d.length === 12) {
    return `+380 ** *** ** ${d.slice(-2)}`;
  }
  return phone;
}
