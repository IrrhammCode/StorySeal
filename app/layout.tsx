import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { WagmiProviderWrapper } from '@/providers/WagmiProvider'
import { ToastProvider } from '@/contexts/ToastContext'

export const metadata: Metadata = {
  title: 'StorySeal - Verify the Origin. Seal the Creation.',
  description: 'Advanced IP protection suite for the Generative AI era',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <WagmiProviderWrapper>
          <ThemeProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ThemeProvider>
        </WagmiProviderWrapper>
      </body>
    </html>
  )
}

