"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import Countdown, { type CountdownRenderProps } from "react-countdown";
import { RefreshCw } from "lucide-react";

import BaseModal from "./BaseModal";
import OtpInput from "@/components/ui/OtpInput";
import {
  apiRequestEmailChange,
  apiConfirmEmailChange,
  getFriendlyErrorMessage,
} from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const emailSchema = z.object({
  email: z.string().min(1, "Введіть email").email("Невірний формат email"),
});
const codeSchema = z.object({
  code: z
    .string()
    .length(6, "Код — 6 цифр")
    .regex(/^\d{6}$/),
});

type EmailForm = z.infer<typeof emailSchema>;
type CodeForm = z.infer<typeof codeSchema>;

interface Props {
  token: string;
  onClose: () => void;
}

function ResendTimer({ onResend }: { onResend: () => void }) {
  // Фіксуємо момент завершення один раз — інакше таймер скидається при кожному рендері
  const [target] = useState(() => Date.now() + 60_000);
  function renderer({ seconds: s, completed }: CountdownRenderProps) {
    if (completed) {
      return (
        <button
          type="button"
          onClick={onResend}
          style={{
            background: "none",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            fontSize: "0.9rem",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <RefreshCw size={13} /> Надіслати повторно
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
    <div style={{ textAlign: "center", marginTop: 12 }}>
      <Countdown date={target} renderer={renderer} />
    </div>
  );
}

export default function ChangeEmailModal({ token, onClose }: Props) {
  const { saveAuth } = useAuthStore();

  // Step 1 form
  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });
  const newEmail = emailForm.watch("email", "");
  const step1Done = emailForm.formState.isSubmitSuccessful;

  // Step 2 form
  const codeForm = useForm<CodeForm>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });
  const code = codeForm.watch("code", "");

  async function handleRequestCode(data: EmailForm) {
    try {
      await apiRequestEmailChange(data.email.trim(), token);
    } catch (err: unknown) {
      emailForm.setError("email", {
        message: getFriendlyErrorMessage(
          err,
          "Помилка при надсиланні коду",
        ),
      });
      throw err; // prevent isSubmitSuccessful
    }
  }

  async function handleConfirm(data: CodeForm) {
    try {
      const updatedUser = await apiConfirmEmailChange(
        newEmail.trim(),
        data.code,
        token,
      );
      saveAuth(token, updatedUser);
      toast.success("Email змінено ✓");
      onClose();
    } catch (err: unknown) {
      codeForm.setError("code", {
        message: getFriendlyErrorMessage(err, "Невірний код"),
      });
      codeForm.setValue("code", "");
    }
  }

  return (
    <BaseModal
      onClose={onClose}
      disableOutsideClick
      maxWidth={380}
      aria-labelledby="change-email-title"
    >
      <div className="modal-icon-wrap modal-icon-accent">
        <Mail size={28} color="var(--accent, #009956)" />
      </div>

      {/* ── Крок 1: новий email ── */}
      {!step1Done && (
        <form onSubmit={emailForm.handleSubmit(handleRequestCode)}>
          <h3 id="change-email-title" style={{ margin: "0 0 6px" }}>
            Зміна email
          </h3>
          <p className="modal-subtitle">
            Введіть новий email — ми надішлемо код підтвердження
          </p>
          <input
            type="email"
            placeholder="Новий email"
            className="modal-input"
            autoFocus
            aria-invalid={!!emailForm.formState.errors.email}
            {...emailForm.register("email")}
          />
          {emailForm.formState.errors.email && (
            <p className="modal-error-text">
              {emailForm.formState.errors.email.message}
            </p>
          )}
          <div className="modal-buttons" style={{ marginTop: 12 }}>
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
              disabled={emailForm.formState.isSubmitting}
            >
              {emailForm.formState.isSubmitting
                ? "Надсилаємо…"
                : "Надіслати код"}
            </button>
          </div>
        </form>
      )}

      {/* ── Крок 2: OTP ── */}
      {step1Done && (
        <form onSubmit={codeForm.handleSubmit(handleConfirm)}>
          <h3 id="change-email-title" style={{ margin: "0 0 6px" }}>
            Введіть код
          </h3>
          <p className="modal-subtitle">
            Код надіслано на <strong>{newEmail}</strong>
          </p>
          <OtpInput
            value={code}
            onChange={(v) =>
              codeForm.setValue("code", v, { shouldValidate: false })
            }
            disabled={codeForm.formState.isSubmitting}
            hasError={!!codeForm.formState.errors.code}
          />
          {codeForm.formState.errors.code && (
            <p className="modal-error-text" style={{ textAlign: "center" }}>
              {codeForm.formState.errors.code.message}
            </p>
          )}
          <ResendTimer onResend={() => emailForm.reset()} />
          <div className="modal-buttons" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                emailForm.reset();
                codeForm.reset();
              }}
            >
              Назад
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!/^\d{6}$/.test(code ?? "") || codeForm.formState.isSubmitting}
            >
              {codeForm.formState.isSubmitting ? "Перевіряємо…" : "Підтвердити"}
            </button>
          </div>
        </form>
      )}
    </BaseModal>
  );
}
