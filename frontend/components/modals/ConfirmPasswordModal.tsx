"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import BaseModal from "./BaseModal";
import { apiVerifyPassword, getFriendlyErrorMessage } from "@/lib/api";

const schema = z.object({
  password: z.string().min(1, "Введіть пароль"),
});
type FormData = z.infer<typeof schema>;

interface Props {
  token: string;
  onSuccess: () => void;
  onClose: () => void;
  /** Контекстне пояснення — що саме підтверджуємо */
  description?: string;
}

const DEFAULT_DESCRIPTION = "Введіть ваш пароль для підтвердження дії";

export default function ConfirmPasswordModal({
  token,
  onSuccess,
  onClose,
  description = DEFAULT_DESCRIPTION,
}: Props) {
  const [showPw, setShowPw] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    try {
      await apiVerifyPassword(data.password, token);
      onSuccess();
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes("400")
          ? "Невірний пароль"
          : getFriendlyErrorMessage(
              err,
              "Помилка мережі. Спробуйте ще раз.",
            );
      setError("password", { message: msg });
    }
  }

  return (
    <BaseModal
      onClose={onClose}
      disableOutsideClick
      maxWidth={380}
      aria-labelledby="confirm-pw-title"
    >
      <div className="modal-icon-wrap modal-icon-accent">
        <ShieldCheck size={28} color="var(--accent, #009956)" />
      </div>

      <h3 id="confirm-pw-title" style={{ margin: "0 0 6px" }}>
        Підтвердьте особистість
      </h3>
      <p className="modal-subtitle">{description}</p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div style={{ position: "relative" }}>
          <input
            type={showPw ? "text" : "password"}
            placeholder="Ваш пароль"
            className="modal-input"
            autoFocus
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "Сховати пароль" : "Показати пароль"}
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
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {errors.password && (
          <p className="modal-error-text">{errors.password.message}</p>
        )}

        <div className="modal-buttons">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Скасувати
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Перевіряємо…" : "Підтвердити"}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
