import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native addon — must be required at runtime, not bundled.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
