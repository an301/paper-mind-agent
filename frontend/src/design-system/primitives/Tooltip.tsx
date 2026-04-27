import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "../util";

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayMs?: number;
}

/**
 * Hover-triggered tooltip. Mono content; small, tight, dark surface.
 * Built on Radix for focus management and collision detection.
 */
export function Tooltip({
  children,
  content,
  side = "top",
  align = "center",
  delayMs = 200,
}: TooltipProps) {
  return (
    <RT.Provider delayDuration={delayMs} skipDelayDuration={100}>
      <RT.Root>
        <RT.Trigger asChild>{children}</RT.Trigger>
        <RT.Portal>
          <RT.Content
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={8}
            className={cn(
              "z-50 max-w-xs rounded-sm border border-border-strong bg-bg-elevated px-2 py-1.5",
              "font-mono text-xs text-fg-default shadow-pop",
            )}
          >
            {content}
            <RT.Arrow
              className="fill-[color:var(--bg-elevated)]"
              width={8}
              height={4}
            />
          </RT.Content>
        </RT.Portal>
      </RT.Root>
    </RT.Provider>
  );
}
