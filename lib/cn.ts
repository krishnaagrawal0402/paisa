import { twMerge } from "tailwind-merge";

/** Join class names, skipping falsy values. Later classes win conflicts (`px-6` + `px-0` → `px-0`). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
