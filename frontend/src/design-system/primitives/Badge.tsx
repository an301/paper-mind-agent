import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../util";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
type Variant = "soft" | "outline";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  variant?: Variant;
  /** Render a leading dot in the tone color. */
  dot?: boolean;
  icon?: ReactNode;
}

const tones: Record<Tone, { soft: string; outline: string; dot: string }> = {
  neutral: {
    soft: "bg-bg-raised text-fg-default",
    outline: "bg-transparent text-fg-default border-border-strong",
    dot: "bg-fg-muted",
  },
  accent: {
    soft: "bg-accent-soft text-accent",
    outline: "bg-transparent text-accent border-accent",
    dot: "bg-accent",
  },
  success: {
    soft: "bg-[color:var(--success)]/10 text-success",
    outline: "bg-transparent text-success border-success",
    dot: "bg-success",
  },
  warning: {
    soft: "bg-[color:var(--warning)]/10 text-warning",
    outline: "bg-transparent text-warning border-warning",
    dot: "bg-warning",
  },
  danger: {
    soft: "bg-[color:var(--danger)]/10 text-danger",
    outline: "bg-transparent text-danger border-danger",
    dot: "bg-danger",
  },
};

export function Badge({
  tone = "neutral",
  variant = "soft",
  dot,
  icon,
  className,
  children,
  ...rest
}: BadgeProps) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5",
        "font-mono text-[10px] uppercase tracking-caps",
        variant === "soft" ? cn(t.soft, "border-transparent") : t.outline,
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />}
      {icon}
      {children}
    </span>
  );
}
