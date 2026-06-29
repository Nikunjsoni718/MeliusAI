import type { Metadata } from 'next'

export const metadata: Metadata = {
  // Bold, exact title targeting the Indian ecosystem (57 characters)
  title: 'MeliusAI | Tech Skill Verification & Talent Finding India', 
  
  // Double-sided value proposition strictly under the 160-character limit (156 characters)
  description: 'India\'s premier tech skill verification and talent finding platform. Developers verify code assets and match scores; companies instantly find vetted talent.',
  
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    'name': 'MeliusAI',
    'url': 'https://meliusai.in',
    'logo': 'https://meliusai.in/icon.png',
    'description': 'Automated skill verification and talent finding platform for the Indian developer ecosystem.',
    'address': {
      '@type': 'PostalAddress',
      'addressCountry': 'IN' // Locks in local credibility with search engines
    }
  }

  return (
    <html lang="en-IN"> {/* Sets the primary document language locale to India */}
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}