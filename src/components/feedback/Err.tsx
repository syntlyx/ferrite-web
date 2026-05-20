interface ErrProps {
  msg: string;
}

export function Err({ msg }: ErrProps) {
  return <p className="py-3 text-xs text-blocked">{msg}</p>;
}
