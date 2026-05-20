import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Btn } from "@/components/ui";

type ConfirmState = {
  message: string;
  resolve: (value: boolean) => void;
};

/**
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirm()
 *   // in JSX: {ConfirmDialog}
 *   // in handler: if (!(await confirm('Delete this?'))) return
 */
export function useConfirm() {
  const { t } = useTranslation();
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback(
    (message: string) => new Promise<boolean>((resolve) => setState({ message, resolve })),
    [],
  );

  const close = useCallback((confirmed: boolean) => {
    setState((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  function handleYes() {
    close(true);
  }
  function handleNo() {
    close(false);
  }

  const ConfirmDialog = state ? (
    <div
      className="animate-fade-up bg-void/70 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      onClick={handleNo}
    >
      <div
        className="animate-scale-in border-bdr bg-card mx-4 w-full max-w-xs rounded-xl border p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-heading mb-1 text-sm">{t("common.confirm_title")}</p>
        <p className="text-muted mb-5 text-xs">{state.message}</p>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={handleNo}>
            {t("common.cancel")}
          </Btn>
          <Btn variant="danger" onClick={handleYes}>
            {t("common.delete")}
          </Btn>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, ConfirmDialog };
}
