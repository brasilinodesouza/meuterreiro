import type { Metadata, Viewport } from 'next';
import { PwaInstall } from '@/components/pwa-install';
import './globals.css';
import './finance.css';
import './auth.css';
export const metadata: Metadata = {
  title: 'MeuTerreiro | Cuidar da casa, cuidar das pessoas',
  description: 'Gestão do terreiro: pessoas, organização e cuidado em um só lugar.',
  robots: { index: false, follow: false },
  applicationName: 'MeuTerreiro',
  appleWebApp: { capable: true, title: 'MeuTerreiro', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#244c3c' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}<PwaInstall /></body></html>;
}
