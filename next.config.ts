import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable React Strict Mode to prevent double-rendering in development
  // This eliminates duplicate API calls during initial page load
  reactStrictMode: false,
};

export default nextConfig;
