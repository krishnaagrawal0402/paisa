"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Shares the month as an image (rendered on the server). Percentages only by
 * default; amounts are opt-in. Uses the phone's share sheet when it can,
 * otherwise downloads the PNG.
 */
export function ShareButton({ monthKey }: { monthKey: string }) {
  const toast = useToast();
  const [withAmounts, setWithAmounts] = useState(false);
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      const res = await fetch(`/api/report/${monthKey}/image?amounts=${withAmounts ? 1 : 0}`);
      if (!res.ok) throw new Error("Couldn't create the image");
      const blob = await res.blob();
      const file = new File([blob], `paisa-${monthKey}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My month in Paisa" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        toast.show({ message: "Image downloaded" });
      }
    } catch (e) {
      // Closing the share sheet throws AbortError: not worth a message.
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        toast.show({ message: e instanceof Error ? e.message : "Couldn't share", tone: "error" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="glass" onClick={share} disabled={busy} className="h-10 px-4">
        <Share2 className="size-4" /> {busy ? "Preparing…" : "Share"}
      </Button>
      <label className="text-muted flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={withAmounts}
          onChange={(e) => setWithAmounts(e.target.checked)}
          className="accent-save size-3.5"
        />
        Include amounts
      </label>
    </div>
  );
}
