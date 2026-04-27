import clsx, { type ClassValue } from "clsx";

/** Class-name composer used by every primitive. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
