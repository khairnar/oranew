import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },

  /*
   * THE MOCK PAYLOADS MUST SHIP WITH THE FUNCTION.
   *
   * `/api/integration` reads `samples/<tenant>/{prefill,cibil}.json` at
   * RUNTIME, through a path built from `process.cwd()`. Next.js traces the
   * files a route imports; it cannot trace a path computed at runtime, so on
   * Vercel those files would simply not be in the serverless bundle.
   *
   * It fails quietly rather than loudly — the route catches a missing fixture
   * per tenant and reports the numbers it can answer for — so mock mode would
   * present as "no mock tenants" and the obvious next move would be to reach
   * for LIVE mode and a real credential. Hence tracing them explicitly.
   *
   * The other sample payloads (`src/lib/samples`) are static `import`s and
   * are bundled by the compiler already; only these runtime reads need it.
   */
  outputFileTracingIncludes: {
    "/api/integration": ["./samples/**/*.json"],
  },
};

export default nextConfig;
