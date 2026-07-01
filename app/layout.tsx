import type { Metadata } from 'next'
import './globals.css' 
import { Navbar } from '@/components/Navbar';
// 1. 🔄 IMPORT THE ICON: Forces Next.js to compile the file right from your app folder
import faviconImage from './favicon.png'

// High-Density SEO Metadata with your compiled favicon assets
export const metadata: Metadata = {
  title: "MeliusAI | Skill Verification & Talent Finding Platform", 
  description: "India's premier tech skill verification and talent finding platform. Developers verify code assets and match scores; companies instantly find vetted talent.",
  
  // 🎯 MAP THE COMPILED SOURCE: Inject the framework-generated asset path
icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
  openGraph: {
    title: 'MeliusAI | Skill Verification & Talent Finding',
    description: 'The objective data layer for Indian engineering capabilities. Verifying developer code assets, discovering tech talent.',
    url: 'https://meliusai.in',
    siteName: 'MeliusAI',
    images: [
      {
        url: 'https://meliusai.in/og-image.png', 
        width: 1200,
        height: 630,
        alt: 'MeliusAI Verification & Discovery Hub'
      },
    ],
    locale: 'en_IN',
    type: 'website',
  },
}

// 2. Single Unified Root Layout Component
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  
  // Structured JSON-LD Data Schema to maximize local search positioning
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    'name': 'MeliusAI',
    'url': 'https://meliusai.in',
    'logo': 'https://meliusai.in/icon.png',
    'description': 'Automated tech skill verification and talent finding platform for the Indian developer ecosystem.',
    'address': {
      '@type': 'PostalAddress',
      'addressCountry': 'IN' // Establishes regional domain authority
    }
  }

  return (
    <html lang="en-IN"> {/* Declares the specific language dialect for indexers */}
      <head>
        {/* Injecting the structured metadata schema right into the HTML head container */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased bg-slate-950 text-slate-50">
        <Navbar />
        {children}
      </body>
    </html>
  )
}