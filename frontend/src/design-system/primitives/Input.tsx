import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../util";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md";
  label?: string;
  description?: string;
  error?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const sizes = {
  sm: "h-7 text-xs",
  md: "h-8 text-sm",
} as const;

const padForIcon = {
  sm: { left: "pl-7", right: "pr-7" },
  md: { left: "pl-8", right: "pr-8" },
} as const;

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    size = "md",
    label,
    description,
    error,
    leadingIcon,
    trailingIcon,
    className,
    id,
    ...rest
  },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const descId = description ? `${inputId}-desc` : undefined;
  const errorId = error ? `${inputId}-err` : undefined;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-fg-default"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leadingIcon && (
          <span
            className={cn(
              "pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-fg-muted",
            )}
          >
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[descId, errorId].filter(Boolean).join(" ") || undefined}
          className={cn(
            "block w-full rounded-sm border bg-bg-elevated text-fg",
            "px-2.5 placeholder:text-fg-subtle",
            "transition-colors duration-quick ease-smooth",
            "border-border-strong hover:border-fg-subtle",
            "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring focus:ring-offset-0",
            "disabled:cursor-not-allowed disabled:opacity-50",
            sizes[size],
            leadingIcon && padForIcon[size].left,
            trailingIcon && padForIcon[size].right,
            error && "border-danger focus:border-danger focus:ring-[color:var(--danger)]/30",
            className,
          )}
          {...rest}
        />
        {trailingIcon && (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-fg-muted">
            {trailingIcon}
          </span>
        )}
      </div>
      {description && !error && (
        <p id={descId} className="text-xs text-fg-muted">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
});

export { Input };
export type { InputProps };
