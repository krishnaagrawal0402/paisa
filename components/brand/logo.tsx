import { appConfig } from "@/config/app";
import { cn } from "@/lib/cn";

/** Rising-bars mark on a neon gradient tile. Same shape as the app icon (lib/brand-icon.tsx). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "from-income to-save inline-flex size-9 items-end justify-center gap-[3px] rounded-xl bg-linear-to-br p-2 shadow-[0_0_24px_rgb(61_255_154/0.35)]",
        className,
      )}
    >
      <span className="bg-bg h-[35%] w-[18%] rounded-sm" />
      <span className="bg-bg h-[60%] w-[18%] rounded-sm" />
      <span className="bg-bg h-[90%] w-[18%] rounded-sm" />
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">{appConfig.name}</span>
    </span>
  );
}
