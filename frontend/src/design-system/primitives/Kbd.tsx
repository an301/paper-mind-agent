import type { HTMLAttributes } from "react";
import { cn } from "../util";

interface KbdProps extends HTMLAttributes<HTMLElement> {
  /** Convenience: pass shorthand like "cmd+k" and we'll render symbols. */
  keys?: string;
  size?: "sm" | "md";
}

const SYMBOLS: Record<string, string> = {
  cmd: "⌘",
  meta: "⌘",
  ctrl: "⌃",
  control: "⌃",
  alt: "⌥",
  opt: "⌥",
  option: "⌥",
  shift: "⇧",
  enter: "↵",
  return: "↵",
  esc: "esc",
  escape: "esc",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  tab: "⇥",
  backspace: "⌫",
  space: "␣",
};

function tokenize(keys: string): string[] {
  return keys
    .split("+")
    .map((k) => k.trim().toLowerCase())
    .map((k) => SYMBOLS[k] ?? k.toUpperCase());
}

const sizeClasses = {
  sm: "h-4 min-w-4 px-1 text-[10px]",
  md: "h-5 min-w-5 px-1.5 text-xs",
} as const;

export function Kbd({ keys, size = "md", className, children, ...rest }: KbdProps) {
  const tokens = keys ? tokenize(keys) : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 align-middle font-mono",
        className,
      )}
      {...rest}
    >
      {tokens
        ? tokens.map((t, i) => (
            <kbd
              key={i}
              className={cn(
                "inline-flex items-center justify-center rounded-sm",
                "border border-border-strong bg-bg-raised text-fg-default",
                "font-mono",
                sizeClasses[size],
              )}
            >
              {t}
            </kbd>
          ))
        : (
            <kbd
              className={cn(
                "inline-flex items-center justify-center rounded-sm",
                "border border-border-strong bg-bg-raised text-fg-default",
                "font-mono",
                sizeClasses[size],
              )}
            >
              {children}
            </kbd>
          )}
    </span>
  );
}
