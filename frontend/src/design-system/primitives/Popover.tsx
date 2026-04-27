import * as RP from "@radix-ui/react-popover";
import type { ReactNode } from "react";
import { cn } from "../util";

interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Width of the popover content. Defaults to 280px. */
  width?: number | string;
}

/**
 * Click-triggered floating panel. Holds richer content than a tooltip:
 * inline explanations, filter controls, KG node detail.
 */
export function Popover({
  trigger,
  children,
  side = "bottom",
  align = "center",
  width = 280,
}: PopoverProps) {
  return (
    <RP.Root>
      <RP.Trigger asChild>{trigger}</RP.Trigger>
      <RP.Portal>
        <RP.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          style={{ width }}
          className={cn(
            "z-50 rounded-md border border-border-strong bg-bg-elevated p-4",
            "text-sm text-fg-default shadow-pop",
            "focus:outline-none",
          )}
        >
          {children}
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  );
}
