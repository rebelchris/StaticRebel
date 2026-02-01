import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'StaticRebel Dashboard',
  description: 'AI Assistant Dashboard powered by local LLMs',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'StaticRebel',
    startupImage: [
      '/icon.svg',
    ],
  },
  formatDetection: {
    telephone: false,
  },
  themeColor: '#3b82f6',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="application-name" content="StaticRebel" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="StaticRebel" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="msapplication-TileColor" content="#3b82f6" />
        <meta name="msapplication-tap-highlight" content="no" />
        
        <link rel="apple-touch-icon" href="/icon.svg" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="shortcut icon" href="/icon.svg" />
        
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:url" content="https://staticrebel.app" />
        <meta name="twitter:title" content="StaticRebel Dashboard" />
        <meta name="twitter:description" content="AI Assistant Dashboard powered by local LLMs" />
        <meta name="twitter:image" content="/icon.svg" />
        <meta name="twitter:creator" content="@staticrebel" />
        
        <meta property="og:type" content="website" />
        <meta property="og:title" content="StaticRebel Dashboard" />
        <meta property="og:description" content="AI Assistant Dashboard powered by local LLMs" />
        <meta property="og:site_name" content="StaticRebel Dashboard" />
        <meta property="og:url" content="https://staticrebel.app" />
        <meta property="og:image" content="/icon.svg" />
      </head>
      <body className={inter.className}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6">{children}</div>
          </main>
        </div>
        <PWAInstallPrompt />
      </body>
    </html>
  );
}
