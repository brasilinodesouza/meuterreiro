import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
const preview = process.env.MEUTERREIRO_STATIC_PREVIEW === '1';
let appVersion = 'development';
let appBuiltAt = '';
try {
  const data = JSON.parse(readFileSync('public/app-version.json', 'utf8'));
  appVersion = data.version;
  appBuiltAt = data.builtAt ?? '';
} catch {
  // npm run dev/build gera o arquivo antes de carregar esta configuração.
}
const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: appVersion, NEXT_PUBLIC_APP_BUILT_AT: appBuiltAt },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        // Compatível com a geração estática, os scripts do Next e o worker do PDF.
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
      ],
    }, ...['/sw.js', '/app-version.json'].map(source => ({
      source,
      headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
    }))];
  },
  ...(preview ? { output: 'export', distDir: '.next-preview' } : {}),
};
export default nextConfig;
