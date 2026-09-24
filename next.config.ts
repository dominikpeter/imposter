import type { NextConfig } from "next";

// no dev-mode badge: it overlaps the bottom buttons on a phone
const nextConfig: NextConfig = { devIndicators: false };

export default nextConfig;
