import type { NextConfig } from 'next';
const preview = process.env.MEUTERREIRO_STATIC_PREVIEW === '1';
const nextConfig: NextConfig = {
  ...(preview ? { output: 'export', distDir: '.next-preview' } : {}),
};
export default nextConfig;
