interface ErrProps {
  msg: string;
}

export function Err({ msg }: ErrProps) {
  return <p className="text-blocked py-3 text-xs">{msg}</p>;
}
