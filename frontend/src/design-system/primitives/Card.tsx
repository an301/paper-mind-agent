import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../util";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Pull padding off the wrapper so children can render edge-to-edge (e.g. table rows). */
  bare?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { bare, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-md border border-border bg-bg-elevated",
        // No drop shadow — borders do the elevation work.
        bare ? "" : "p-5",
        className,
      )}
      {...rest}
    />
  );
});

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

function CardHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  ...rest
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-border px-5 py-4",
        className,
      )}
      {...rest}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 font-mono text-xs uppercase tracking-caps text-fg-muted">
            {eyebrow}
          </div>
        )}
        {title && (
          <h3 className="truncate text-sm font-medium text-fg">{title}</h3>
        )}
        {description && (
          <p className="mt-1 text-xs text-fg-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...rest} />;
}

function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border px-5 py-3",
        className,
      )}
      {...rest}
    />
  );
}

export { Card, CardHeader, CardBody, CardFooter };
export type { CardProps };
