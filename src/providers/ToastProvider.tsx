import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle, XCircle, X } from "lucide-react";
import { ToastContext } from "@/hooks/use-toast";
import type { ToastType } from "@/hooks/use-toast";

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle size={14} className="text-teal shrink-0" />,
  error: <XCircle size={14} className="text-blocked shrink-0" />,
};

let _id = 0;

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (message: string, type: ToastType = "success", duration = 3500) => {
      const id = ++_id;
      setToasts((p) => [...p, { id, message, type }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}

      <div className="z-100 pointer-events-none fixed bottom-4 right-4 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="min-w-56 animate-slide-in-right border-bdr bg-card text-body pointer-events-auto flex max-w-xs items-center gap-2.5 rounded-xl border px-4 py-3 text-xs shadow-2xl"
          >
            {ICONS[t.type]}
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="text-muted hover:text-heading ml-1 shrink-0 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
