import { ImageResponse } from "next/og";

/**
 * App icon drawn in code (no binary assets to keep in sync): three rising bars
 * on a neon gradient. `maskable` adds the safe-zone padding Android expects.
 */
export function brandIcon(size: number, { maskable = false, rounded = true } = {}) {
  const pad = maskable ? size * 0.2 : size * 0.18;
  const bar = { width: size * 0.13, borderRadius: size * 0.03, background: "#07070b" };

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: size * 0.06,
        padding: pad,
        background: "linear-gradient(135deg, #3dff9a 0%, #22d3ee 100%)",
        borderRadius: rounded && !maskable ? size * 0.22 : 0,
      }}
    >
      <div style={{ ...bar, height: "35%" }} />
      <div style={{ ...bar, height: "62%" }} />
      <div style={{ ...bar, height: "92%" }} />
    </div>,
    { width: size, height: size },
  );
}
