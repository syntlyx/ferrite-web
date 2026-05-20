import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { Input, Btn } from "@/components/ui";

export default function Login() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.login(password);
      navigate("/");
    } catch {
      setError(t("login.invalid_password"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-canvas bg-void flex min-h-screen items-center justify-center p-6">
      <div className="animate-fade-up w-full max-w-sm">
        <div className="border-bdr/80 mx-auto mb-7 flex h-24 w-72 max-w-full items-center justify-center overflow-hidden rounded-lg border bg-[#05070a] shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
          <img
            src="/ferrite-logo.svg"
            alt="Ferrite"
            className="h-full w-full object-contain p-3"
            draggable={false}
          />
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-bdr/85 bg-card space-y-4 rounded-lg border p-6 shadow-[0_14px_34px_rgba(0,0,0,0.22)]"
        >
          <h2 className="text-heading text-center text-sm font-semibold">{t("login.sign_in")}</h2>
          <div className="space-y-1.5">
            <label className="text-muted block text-xs">{t("login.password_label")}</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              autoFocus
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full"
            />
          </div>
          {error && <p className="text-blocked text-xs">{error}</p>}
          <Btn type="submit" disabled={loading} className="w-full justify-center py-2">
            {loading ? t("login.submitting") : t("login.submit")}
          </Btn>
        </form>
      </div>
    </div>
  );
}
