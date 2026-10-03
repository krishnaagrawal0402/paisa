"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect, useSyncExternalStore } from "react";

const DESKTOP = "(min-width: 768px)";

function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DESKTOP);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

/** Bottom sheet on phones (drag the handle down to dismiss), centred dialog on desktop. */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const isDesktop = useIsDesktop();
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const motionProps = isDesktop
    ? {
        initial: { opacity: 0, scale: 0.96, y: 12 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.96, y: 12 },
      }
    : { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="border-line bg-bg-raised/95 pb-safe relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] border-t shadow-[0_-20px_60px_rgb(0_0_0/0.5)] backdrop-blur-2xl md:max-w-lg md:rounded-[28px] md:border md:pb-0"
            {...motionProps}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag={isDesktop ? false : "y"}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
          >
            <div
              className="flex shrink-0 cursor-grab touch-none justify-center pt-3 pb-1 md:hidden"
              onPointerDown={(e) => drag.start(e)}
            >
              <span className="bg-subtle/50 h-1.5 w-10 rounded-full" />
            </div>
            <div className="flex shrink-0 items-center justify-between px-5 pt-1 pb-2 md:pt-5">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-muted hover:bg-glass hover:text-fg grid size-9 place-items-center rounded-full"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
