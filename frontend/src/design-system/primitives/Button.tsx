import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../util";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  asChild?: boolean;
}

const variants: Record<Variant, string> = {
  primary: cn(
    "bg-accent text-accent-fg border border-accent",
    "hover:bg-accent-hover hover:border-accent-hover",
    "active:bg-accent-active active:border-accent-active",
  ),
  secondary: cn(
    "bg-bg-elevated text-fg border border-border-strong",
    "hover:bg-bg-hover",
    "active:bg-bg-active",
  ),
  ghost: cn(
    "bg-transparent text-fg-default border border-transparent",
    "hover:bg-bg-hover hover:text-fg",
    "active:bg-bg-active",
  ),
  danger: cn(
    "bg-danger text-accent-fg border border-danger",
    "hover:opacity-90",
    "active:opacity-80",
  ),
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-8 px-3 text-sm gap-2",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading,
    leadingIcon,
    trailingIcon,
    asChild,
    className,
    children,
    disabled,
    ...rest
  },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref as never}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-sm font-medium",
        // Motion: instant enter, fast leave on color/border, snap on press
        "transition-[background-color,border-color,color,opacity] duration-quick ease-smooth",
        "active:scale-[0.98] active:transition-transform active:duration-[80ms]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ring",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoadingDot /> : leadingIcon}
      <span>{children}</span>
      {trailingIcon}
    </Comp>
  );
});

function LoadingDot() {
  // Single mono character that pulses — replaces shimmer skeletons.
  return (
    <span className="font-mono text-fg-muted [animation:dotPulse_1s_ease-in-out_infinite]">
      ·
    </span>
  );
}

export { Button };
export type { ButtonProps };
