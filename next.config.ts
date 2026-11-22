import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page in this app is per-user and reads the session cookie, so pages
  // render on each request. Cache Components is left off to keep things simple.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
