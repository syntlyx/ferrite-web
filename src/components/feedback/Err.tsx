import { AlertTriangle } from "lucide-react";

interface ErrProps {
  msg: string;
}

export function Err({ msg }: ErrProps) {
  return (
    <div className="border-blocked/40 bg-blocked/5 text-blocked rounded-xs mb-4 flex items-start gap-2 border px-3 py-2.5 text-xs">
      <AlertTriangle size={13} className="mt-px shrink-0" />
      <span className="wrap-break-word min-w-0">{msg}</span>
    </div>
  );
}
