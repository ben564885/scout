import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ssh2 (lib/hermes-notify.ts, the same-day emergency notify channel) ships
  // a native-style crypto module Turbopack can't bundle into an ESM chunk —
  // load it natively at runtime instead of bundling it.
  serverExternalPackages: ["ssh2"],
};

export default nextConfig;
