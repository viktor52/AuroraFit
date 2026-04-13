import type { Metadata, Viewport } from 'next'
import { PwaInstallButton } from '@/components/pwa/PwaInstallButton'
import './globals.css'

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'AuroraFit',
  description: 'Fitness PWA',
  applicationName: 'AuroraFit',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AuroraFit',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: '/icons/app-icon.png', type: 'image/png', sizes: '512x512' }],
    apple: [{ url: '/icons/app-icon.png', type: 'image/png', sizes: '180x180' }],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaInstallButton />
      </body>
    </html>
  )
}
