import { cn } from "@/lib/cn";

const variants = {
  primary:
    "bg-income text-bg font-semibold shadow-[0_0_24px_rgb(61_255_154/0.35)] hover:shadow-[0_0_32px_rgb(61_255_154/0.55)] hover:brightness-110",
  glass: "glass !rounded-full text-fg hover:bg-glass-hover",
  ghost: "text-muted hover:text-fg hover:bg-glass",
} as const;

type ButtonProps = React.ComponentProps<"button"> & { variant?: keyof typeof variants };

/** Button looks for links (a <button> inside an <a> is invalid HTML). */
export function buttonClass(variant: keyof typeof variants = "primary", className?: string) {
  return cn(
    "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    className,
  );
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button className={buttonClass(variant, className)} {...props} />;
}
