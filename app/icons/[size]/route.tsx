import { brandIcon } from "@/lib/brand-icon";

/** PWA manifest icons: /icons/192, /icons/512, /icons/maskable-512. */
const ICONS: Record<string, { size: number; maskable?: boolean }> = {
  "192": { size: 192 },
  "512": { size: 512 },
  "maskable-512": { size: 512, maskable: true },
};

export function generateStaticParams() {
  return Object.keys(ICONS).map((size) => ({ size }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const icon = ICONS[(await params).size];
  if (!icon) return new Response("Not found", { status: 404 });
  return brandIcon(icon.size, { maskable: icon.maskable });
}
