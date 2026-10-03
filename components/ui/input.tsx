import { cn } from "@/lib/cn";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "border-line bg-glass text-fg placeholder:text-subtle h-12 w-full rounded-2xl border px-4 text-base",
        "focus:border-save/60 focus:bg-glass-hover transition-colors outline-none",
        className,
      )}
      {...props}
    />
  );
}
