import type { ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Highlighted state for toggles (active tool, loop on, snap on). */
  active?: boolean;
}

/** Square icon button used across the transport bar and timeline toolbar. */
export default function IconButton({ active = false, className = '', ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors disabled:opacity-30 ${
        active
          ? 'bg-indigo-500/20 text-indigo-300'
          : 'text-zinc-400 enabled:hover:bg-zinc-700/60 enabled:hover:text-zinc-100'
      } ${className}`}
      {...props}
    />
  );
}
