import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("glass p-5", className)} {...props} />;
}

export function CardLabel({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-muted text-xs font-medium tracking-[0.08em] uppercase", className)} {...props} />;
}
