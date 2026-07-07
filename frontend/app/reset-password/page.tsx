"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock } from "lucide-react";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiConfirmPasswordReset } from "@/lib/api";
import {
  resetPasswordSchema,
  type ResetPasswordFormData,
} from "@/lib/schemas";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  async function onSubmit(data: ResetPasswordFormData) {
    if (!token) {
      setServerError("Посилання для скидання пароля недійсне");
      return;
    }

    setServerError("");
    try {
      await apiConfirmPasswordReset(token, data.password);
      setSuccess(true);
    } catch (err) {
      setServerError(
        err instanceof Error
          ? err.message
          : "Не вдалося змінити пароль. Спробуйте ще раз.",
      );
    }
  }

  return (
    <>
      <Header />
      <main className="register-section">
        <div className="register-box">
          <h2 className="register-title">Новий пароль</h2>
          <p className="register-subtitle">
            {success
              ? "Пароль успішно оновлено"
              : "Введіть новий пароль для вашого акаунта"}
          </p>

          {!success ? (
            <div className="register-form">
              {!token && (
                <p className="register-error">
                  Посилання для скидання пароля недійсне або неповне
                </p>
              )}

              <div className="register-field">
                <label htmlFor="resetPassword">Новий пароль</label>
                <div className="register-input-wrap">
                  <Lock size={16} className="register-icon" />
                  <input
                    id="resetPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Мінімум 6 символів"
                    autoComplete="new-password"
                    aria-invalid={!!errors.password}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    className="register-eye"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label="Показати пароль"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && (
                  <span className="register-hint error">
                    {errors.password.message}
                  </span>
                )}
              </div>

              <div className="register-field">
                <label htmlFor="resetConfirm">Підтвердіть пароль</label>
                <div className="register-input-wrap">
                  <Lock size={16} className="register-icon" />
                  <input
                    id="resetConfirm"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Повторіть пароль"
                    autoComplete="new-password"
                    aria-invalid={!!errors.confirm}
                    {...register("confirm")}
                  />
                  <button
                    type="button"
                    className="register-eye"
                    onClick={() => setShowConfirm((value) => !value)}
                    aria-label="Показати підтвердження"
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.confirm && (
                  <span className="register-hint error">
                    {errors.confirm.message}
                  </span>
                )}
              </div>

              {serverError && <p className="register-error">{serverError}</p>}

              <button
                type="button"
                className="register-button"
                disabled={isSubmitting || !token}
                onClick={handleSubmit(onSubmit)}
              >
                {isSubmitting ? "Зберігаємо..." : "Змінити пароль"}
              </button>
            </div>
          ) : (
            <div className="register-links">
              <Link href="/login">Увійти з новим паролем</Link>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
