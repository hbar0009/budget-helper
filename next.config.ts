import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native addon; google-auth-library does runtime requires
  // and reads a key file — both must be required at runtime, not bundled.
  serverExternalPackages: ["better-sqlite3", "google-auth-library"],
};

export default nextConfig;
