import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf2json'],
  experimental: {
    turbo: {
      root: '.',
    },
  },
};

export default nextConfig;
