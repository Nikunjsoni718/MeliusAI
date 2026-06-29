import type { Metadata } from 'next'
import './globals.css' // Crucial: Injects your Tailwind utility styles globally

// 1. High-Density SEO Metadata targeting the Indian Verification Market
export const metadata: Metadata = {
  // Catchy, targeted blue link for the Indian tech market (Under 60 chars)
  title: "MeliusAI | Skill Verification & Talent Finding Platform", 
  
  // Double-sided value proposition strictly under the 160-character limit (156 characters)
  description: "India's premier tech skill verification and talent finding platform. Developers verify code assets and match scores; companies instantly find vetted talent.",
  
  // OpenGraph tags manage how the link renders when posted on social channels like LinkedIn or X
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
    locale: 'en_IN', // Explicitly signals regional search context to crawlers
    type: 'website',
  },
}

// 2. Root Layout Component Wrapping the Interface Shell
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
        {children}
      </body>
    </html>
  )
}