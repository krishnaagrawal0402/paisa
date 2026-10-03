import "server-only";
import { headers } from "next/headers";
import { getServerEnv } from "@/lib/env";

/** Public origin of this instance: SITE_URL if set, else derived from the request. */
export async function getSiteUrl(): Promise<string> {
  const { siteUrl } = getServerEnv();
  if (siteUrl) return siteUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
