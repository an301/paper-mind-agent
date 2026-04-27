import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../util";

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: "sm" | "md";
  label?: string;
  description?: string;
}

const sizes = {
  sm: "h-7 text-xs",
  md: "h-8 text-sm",
} as const;

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = "md", label, description, className, id, children, ...rest },
  ref,
) {
  const reactId = useId();
  const selectId = id ?? reactId;
  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-fg-default">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            "block w-full appearance-none rounded-sm border bg-bg-elevated text-fg",
            "pl-2.5 pr-8 cursor-pointer",
            "transition-colors duration-quick ease-smooth",
            "border-border-strong hover:border-fg-subtle",
            "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            sizes[size],
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
          size={size === "sm" ? 12 : 14}
          strokeWidth={1.5}
        />
      </div>
      {description && (
        <p className="text-xs text-fg-muted">{description}</p>
      )}
    </div>
  );
});

export { Select };
export type { SelectProps };
