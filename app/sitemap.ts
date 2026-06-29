import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://meliusai.in',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    // Add any other public landing pages here (e.g., /about, /explore)
  ]
}