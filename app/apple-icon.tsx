import { brandIcon } from "@/lib/brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS applies its own rounded mask, so the tile is square here.
export default function AppleIcon() {
  return brandIcon(180, { rounded: false });
}
