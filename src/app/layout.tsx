import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Rikunabi AI Sales Tool | Next-Gen Intelligence',
  description: 'AI-driven Rikunabi scraping and sales advice generator.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
