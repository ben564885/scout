import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ssh2 (lib/hermes-notify.ts, the same-day emergency notify channel) ships
  // a native-style crypto module Turbopack can't bundle into an ESM chunk —
  // load it natively at runtime instead of bundling it.
  serverExternalPackages: ["ssh2"],
  // A sibling package-lock.json one directory up (outside this repo) makes
  // Turbopack infer the wrong workspace root and, at least once, crash the
  // dev server mid-request rather than just warning. Pin it explicitly.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
