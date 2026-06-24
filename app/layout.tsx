import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import AuthBootstrap from '@/components/AuthBootstrap'
import GoogleMapsProvider from '@/components/GoogleMapsProvider'
import PwaBootstrap from '@/components/PwaBootstrap'
import { Toaster } from '@/components/ui/toaster'
import { PwaInstallProvider } from '@/hooks/usePwaInstall'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'MABINI DISASTER RISK HOUSEHOLD PROFILING SYSTEM',
  description: 'MABINI DISASTER RISK HOUSEHOLD PROFILING SYSTEM',
  generator: 'v0.app',
  applicationName: 'MABINI DISASTER RISK HOUSEHOLD PROFILING SYSTEM',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MABINI DISASTER RISK HOUSEHOLD PROFILING SYSTEM',
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
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="font-sans antialiased">
        <PwaInstallProvider>
          <PwaBootstrap />
          <AuthBootstrap>
            <GoogleMapsProvider>
              {children}
            </GoogleMapsProvider>
          </AuthBootstrap>
          <Toaster />
        </PwaInstallProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
