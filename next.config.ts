import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Pasted code can be long; Server Actions default to a 1 MB body.
  // Our own limit (MAX_INPUT_CHARS) is far below this, checked with Zod.
  experimental: { serverActions: { bodySizeLimit: "256kb" } },
  turbopack: {
    // This folder sits inside a larger home-folder checkout; pin the root here.
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      // Share pages must never leak their token through the Referer header.
      { source: "/s/:token", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
