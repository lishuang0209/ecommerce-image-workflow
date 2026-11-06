import { ShoppingBag } from 'lucide-react';

export function EcommerceBrandMark({ className = 'size-7' }: { className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-[9px] bg-[var(--beat-accent)] text-black ${className}`}>
      <ShoppingBag className="size-4" aria-hidden="true" />
    </span>
  );
}
