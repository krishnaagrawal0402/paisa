"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Toast = {
  id: number;
  message: string;
  tone?: "default" | "error";
  action?: { label: string; onClick: () => void };
};

type ToastApi = { show: (toast: Omit<Toast, "id">) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

/** One toast at a time, bottom of the screen (above the mobile tab bar). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nextId = useRef(0);

  const show = useCallback((t: Omit<Toast, "id">) => {
    clearTimeout(timer.current);
    setToast({ ...t, id: ++nextId.current });
    timer.current = setTimeout(() => setToast(null), t.action ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 md:bottom-6"
      >
        <AnimatePresence mode="popLayout">
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className={cn(
                "border-line bg-bg-raised/95 pointer-events-auto flex items-center gap-4 rounded-full border py-2.5 pr-2.5 pl-5 text-sm shadow-[0_10px_40px_rgb(0_0_0/0.5)] backdrop-blur-xl",
                toast.tone === "error" && "border-expense/40 text-expense",
              )}
            >
              <span>{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    setToast(null);
                    toast.action?.onClick();
                  }}
                  className="text-income hover:bg-income/10 rounded-full px-3 py-1 font-semibold"
                >
                  {toast.action.label}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
