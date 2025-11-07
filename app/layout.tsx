// app/layout.tsx
import "./globals.css"
import { Inter } from "next/font/google"
import { Header } from "./components/Header"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "WriteOffs.io",
  description: "That’s a write-off. Automatically.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.className} min-h-screen bg-neutral-50 text-neutral-900 antialiased`}>
        <Header />
        <main className="pt-16 pb-10 px-4 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  )
}
