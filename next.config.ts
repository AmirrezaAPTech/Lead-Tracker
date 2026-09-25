import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Build directory, overridable per process.
   *
   * `next dev` and `next build` each take exclusive ownership of `distDir`, so
   * a verification build run while the dev server is up strips the chunks that
   * server is still serving. Setting NEXT_DIST_DIR gives the build its own
   * directory instead:
   *
   *   NEXT_DIST_DIR=.next-verify npm run build
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
