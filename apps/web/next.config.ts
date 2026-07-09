import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Bundle the T&C PDF into every serverless function so fs.readFile works in
  // prod (the collab email attaches it; it used to live outside the repo and
  // silently vanished on Vercel).
  outputFileTracingIncludes: {
    "/**": ["./legal/**"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // Client router cache reuses visited/prefetched pages for 30s (dynamic) —
    // tab hops and back-nav are instant, but revisited data can be up to 30s
    // stale unless a server action revalidated it (revalidatePath/Tag).
    staleTimes: { dynamic: 30, static: 180 },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.weserv.nl" },
      { protocol: "https", hostname: "scontent.cdninstagram.com" },
      { protocol: "https", hostname: "*.cdninstagram.com" },
    ],
  },
};

export default config;
