import type { Metadata, Viewport } from 'next';
import { PwaInstall } from '@/components/pwa-install';
import { ThemeToggle } from '@/components/theme-toggle';
import { themeBootstrap } from '@/lib/theme';
import { installBootstrap } from '@/lib/pwa';
import './globals.css';
import './finance.css';
import './auth.css';
import './theme.css';
import './pwa.css';
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
  return <html lang="pt-BR" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeBootstrap}} /><script dangerouslySetInnerHTML={{__html:installBootstrap}} /></head><body><ThemeToggle />{children}<PwaInstall /></body></html>;
}
