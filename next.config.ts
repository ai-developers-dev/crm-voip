import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "use-sync-external-store/shim": "react",
      "use-sync-external-store/shim/index.js": "react",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "use-sync-external-store/shim/index.js": require.resolve("react"),
      "use-sync-external-store/shim": require.resolve("react"),
    };
    return config;
  },
};

export default nextConfig;
