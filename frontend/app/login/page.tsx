"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useRef } from "react";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

import GoogleIcon from "@/components/GoogleIcon";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ForgotPasswordModal from "@/components/modals/ForgotPasswordModal";
import TwoFactorModal from "@/components/modals/TwoFactorModal";
import { useFingerprint } from "@/hooks/useFingerprint";
import { useVerificationStore, isOtpValid } from "@/store/verificationStore";
import { loginSchema, type LoginFormData } from "@/lib/schemas";

// Карта помилок NextAuth → зрозумілі повідомлення
const AUTH_ERRORS: Record<string, string> = {
  CredentialsSignin: "Невірний email або пароль",
  OAuthAccountNotLinked:
    "Цей email вже використовується з іншим способом входу",
  OAuthSignin: "Помилка входу через Google. Спробуйте ще раз",
  SessionRequired: "Будь ласка, увійдіть в акаунт",
  Default: "Сталася помилка. Спробуйте ще раз",
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const callbackUrl = searchParams.get("callbackUrl") || "/shop";
  const urlError = searchParams.get("error");

  // Task 2: fingerprint device ID
  const { deviceId } = useFingerprint();

  // Task 2: 2FA modal state
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [twoFactorEmail, setTwoFactorEmail] = useState("");
  const [twoFactorUserId, setTwoFactorUserId] = useState<number>(0);

  // Task 4: відновити 2FA якщо юзер закривав модалку
  const { twoFactor, setTwoFactorOtpSent } = useVerificationStore();
  const hasActiveTwoFactor =
    twoFactor.otpSent &&
    isOtpValid(twoFactor.expiresAt) &&
    !!twoFactor.pendingEmail;

  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState(
    urlError ? (AUTH_ERRORS[urlError] ?? AUTH_ERRORS.Default) : "",
  );
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  // Зберігаємо креди щоб використати signIn після успішної 2FA
  const pendingCredentials = useRef<{ email: string; password: string } | null>(
    null,
  );

  async function onSubmit(data: LoginFormData) {
    setServerError("");

    const currentDeviceId = deviceId ?? "unknown";

    try {
      /**
       * Preflight-запит напряму до бекенду — перевіряємо requires_2fa
       * до виклику signIn, бо NextAuth v5 не пробрасує кастомні помилки
       * з authorize() назад до клієнта.
       *
       * 🔌 ENDPOINT: POST /api/auth/login
       * Body: { email, password, deviceId }
       * 200 { token, user }         → звичайний логін
       * 200 { requires_2fa: true }  → новий пристрій, потрібна 2FA
       * 401                         → невірні креди
       */
      const preflight = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: data.email,
            password: data.password,
            deviceId: currentDeviceId,
          }),
        },
      );

      if (!preflight.ok) {
        setServerError(AUTH_ERRORS.CredentialsSignin);
        return;
      }

      const preData = await preflight.json();

      if (preData.requires_2fa) {
        // Зберігаємо креди — після 2FA пристрій буде зареєстрований,
        // і signIn в handleTwoFactorSuccess спрацює без 2FA
        pendingCredentials.current = {
          email: data.email,
          password: data.password,
        };
        setTwoFactorEmail(data.email);
        setTwoFactorUserId(preData.userId);
        setTwoFactorOtpSent(data.email);
        setShowTwoFactor(true);
        return;
      }

      // Пристрій відомий → викликаємо signIn (бекенд відповість 200 одразу)
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        deviceId: currentDeviceId,
        redirect: false,
      });

      if (!result) {
        setServerError(AUTH_ERRORS.Default);
        return;
      }

      if (result.error) {
        setServerError(AUTH_ERRORS[result.error] ?? AUTH_ERRORS.Default);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setServerError("Сталася помилка. Спробуйте ще раз");
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl });
  }

  async function handleTwoFactorSuccess(_token: string) {
    setShowTwoFactor(false);

    // Пристрій тепер зареєстрований — signIn пройде без 2FA
    const creds = pendingCredentials.current;
    if (creds) {
      pendingCredentials.current = null;
      const result = await signIn("credentials", {
        email: creds.email,
        password: creds.password,
        deviceId: deviceId ?? "unknown",
        redirect: false,
      });
      if (result?.error) {
        setServerError(AUTH_ERRORS[result.error] ?? AUTH_ERRORS.Default);
        return;
      }
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <>
      <Header />
      <main className="register-section">
        <div className="register-box">
          <h2 className="register-title">Вхід</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="register-form">
            {/* Email */}
            <div className="register-field">
              <label htmlFor="loginEmail">Email</label>
              <div className="register-input-wrap">
                <Mail size={16} className="register-icon" />
                <input
                  id="loginEmail"
                  type="email"
                  placeholder="example@email.com"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <span className="register-hint error">
                  {errors.email.message}
                </span>
              )}
            </div>

            {/* Пароль */}
            <div className="register-field">
              <label htmlFor="loginPassword">Пароль</label>
              <div className="register-input-wrap">
                <Lock size={16} className="register-icon" />
                <input
                  id="loginPassword"
                  type={showPw ? "text" : "password"}
                  placeholder="Введіть пароль"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  {...register("password")}
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
              {errors.password && (
                <span className="register-hint error">
                  {errors.password.message}
                </span>
              )}
            </div>

            {serverError && <p className="register-error">{serverError}</p>}

            {/* Task 4: якщо є незавершена 2FA — показуємо підказку */}
            {hasActiveTwoFactor && !showTwoFactor && (
              <button
                type="button"
                onClick={() => {
                  setTwoFactorEmail(twoFactor.pendingEmail!);
                  setShowTwoFactor(true);
                }}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: 10,
                  border: "1.5px solid var(--accent, #009956)",
                  background: "rgba(0,153,86,0.06)",
                  color: "var(--accent, #009956)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  marginBottom: 4,
                }}
              >
                ↩ Продовжити підтвердження входу (код ще дійсний)
              </button>
            )}

            <button
              className="register-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Вхід..." : "Увійти"}
            </button>

            <div className="google-login">
              <button
                id="google-login-btn"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
              >
                <GoogleIcon size={20} />
                {googleLoading ? "Перенаправляємо..." : "Увійти через Google"}
              </button>
            </div>
          </form>

          <div className="register-links login-links-row">
            <button
              type="button"
              className="forgot-link"
              onClick={() => setForgotOpen(true)}
            >
              Забули пароль?
            </button>
            <span>
              Немає акаунту? <Link href="/registration">Реєстрація</Link>
            </span>
          </div>
        </div>
      </main>
      <Footer />

      {/* Task 2: 2FA модалка */}
      {showTwoFactor && (
        <TwoFactorModal
          email={twoFactorEmail || (getValues("email") ?? "")}
          userId={twoFactorUserId}
          deviceId={deviceId}
          onSuccess={handleTwoFactorSuccess}
          onClose={() => setShowTwoFactor(false)}
        />
      )}

      {forgotOpen && (
        <ForgotPasswordModal onClose={() => setForgotOpen(false)} />
      )}
    </>
  );
}
