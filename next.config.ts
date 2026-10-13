import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
const preview = process.env.MEUTERREIRO_STATIC_PREVIEW === '1';
let appVersion = 'development';
try {
  appVersion = JSON.parse(readFileSync('public/app-version.json', 'utf8')).version;
} catch {
  // npm run dev/build gera o arquivo antes de carregar esta configuração.
}
const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
  async headers() {
    return ['/sw.js', '/app-version.json'].map(source => ({
      source,
      headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
    }));
  },
  ...(preview ? { output: 'export', distDir: '.next-preview' } : {}),
};
export default nextConfig;
