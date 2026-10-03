import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-only badge overlaps the sidebar (desktop) or tab bar (mobile).
  // Build errors still show in the dev overlay without it.
  devIndicators: false,
};

export default nextConfig;
