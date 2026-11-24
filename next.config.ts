import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'node:sqlite'],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
