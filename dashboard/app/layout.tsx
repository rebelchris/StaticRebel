import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'StaticRebel Dashboard',
  description: 'AI Assistant Dashboard powered by local LLMs - Your personal AI companion for productivity and creativity',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'StaticRebel',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'StaticRebel Dashboard',
    title: {
      default: 'StaticRebel Dashboard',
      template: '%s | StaticRebel Dashboard',
    },
    description: 'AI Assistant Dashboard powered by local LLMs',
  },
  twitter: {
    card: 'summary',
    title: {
      default: 'StaticRebel Dashboard',
      template: '%s | StaticRebel Dashboard',
    },
    description: 'AI Assistant Dashboard powered by local LLMs',
  },
};

export const viewport: Viewport = {
  themeColor: '#1f2937',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Also supported by less commonly used
  // interactiveWidget: 'resizes-visual',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon-192x192.png" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="StaticRebel" />
        <meta name="application-name" content="StaticRebel" />
        <meta name="msapplication-TileColor" content="#1f2937" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body className={inter.className}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
