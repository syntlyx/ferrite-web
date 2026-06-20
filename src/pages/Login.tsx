import { useActionState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { Input, Btn } from "@/components/ui";
import { FerriteMark } from "@/components/layout/Brand";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [error, submit, pending] = useActionState<string, FormData>(async (_prev, formData) => {
    try {
      await api.login(String(formData.get("password") ?? ""));
      navigate("/");
      return "";
    } catch {
      return t("login.invalid_password");
    }
  }, "");

  return (
    <div className="app-canvas bg-void flex min-h-screen items-center justify-center p-6">
      <div className="animate-fade-up w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <FerriteMark className="mb-5 h-16 w-16" />
          <h1 className="display-title text-heading text-3xl">ferrite</h1>
          <p className="text-muted mt-2 font-mono text-[10px] font-medium uppercase tracking-[0.3em]">
            DNS · Control · Plane
          </p>
        </div>

        <form
          action={submit}
          className="control-surface plate-ticks ember-seam border-bdr/85 rounded-xs space-y-4 border p-6"
        >
          <h2 className="text-heading text-center font-mono text-xs font-medium uppercase tracking-[0.14em]">
            {t("login.sign_in")}
          </h2>
          <div className="space-y-1.5">
            <label className="text-muted block text-xs">{t("login.password_label")}</label>
            <Input
              type="password"
              name="password"
              autoFocus
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full"
            />
          </div>
          {error && <p className="text-blocked text-xs">{error}</p>}
          <Btn type="submit" disabled={pending} className="w-full justify-center py-2">
            {pending ? t("login.submitting") : t("login.submit")}
          </Btn>
        </form>
      </div>
    </div>
  );
}
