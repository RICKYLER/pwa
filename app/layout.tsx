import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import AuthBootstrap from '@/components/AuthBootstrap'
import GoogleMapsProvider from '@/components/GoogleMapsProvider'
import PwaBootstrap from '@/components/PwaBootstrap'
import SupabaseRealtimeBridge from '@/components/SupabaseRealtimeBridge'
import './globals.css'

export const metadata: Metadata = {
  title: 'MSWDO Census PWA',
  description: 'Municipal household census management system with live Supabase realtime sync',
  generator: 'v0.app',
  applicationName: 'MSWDO Census',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MSWDO Census',
  },
  formatDetection: {
    telephone: true,
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      {
        url: '/favicon-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
      {
        url: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1a' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="font-sans antialiased">
        <PwaBootstrap />
        <SupabaseRealtimeBridge />
        <AuthBootstrap>
          <GoogleMapsProvider>
            {children}
          </GoogleMapsProvider>
        </AuthBootstrap>
        <Analytics />
      </body>
    </html>
  )
}
