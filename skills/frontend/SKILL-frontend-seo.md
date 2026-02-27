# Frontend Engineer - SEO

<!-- Token Target: 600-800 tokens -->
<!-- Load When: page, landing, marketing, blog, product, public, metadata, sitemap -->

## Metadata on Every Public Page

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page Title | Brand Name',
  description: 'Concise description under 160 characters.',
  openGraph: {
    title: 'Page Title | Brand Name',
    description: 'Description for social sharing.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Description of image' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Page Title | Brand Name',
    description: 'Description for Twitter.',
  },
  alternates: {
    canonical: 'https://example.com/this-page',
  },
};
```

For dynamic pages, use `generateMetadata`:

```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct(params.slug);
  return {
    title: `${product.name} | Brand`,
    description: product.description.slice(0, 160),
    alternates: { canonical: `https://example.com/products/${params.slug}` },
  };
}
```

## Structured Data (JSON-LD)

Add to relevant pages (products, articles, org):

```tsx
export default function ProductPage({ product }: Props) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.imageUrl,
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'USD',
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Page content */}
    </>
  );
}
```

## Semantic Headings

```tsx
// CORRECT — one h1, sequential levels
<h1>Product Name</h1>
<h2>Features</h2>
<h3>Feature One</h3>
<h2>Reviews</h2>

// WRONG — skipped levels, multiple h1s
<h1>Title</h1>
<h1>Another Title</h1>
<h3>Jumped from h1 to h3</h3>
```

## Images

```tsx
// All content images need descriptive alt text
<Image src={hero} alt="Team collaborating around a whiteboard" priority sizes="100vw" />

// Decorative images: empty alt
<Image src={divider} alt="" role="presentation" />
```

## Robots & Sitemap

```tsx
// app/robots.ts
import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: 'https://example.com/sitemap.xml',
  };
}

// app/sitemap.ts
import type { MetadataRoute } from 'next';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getProducts();
  return [
    { url: 'https://example.com', lastModified: new Date() },
    ...products.map((p) => ({ url: `https://example.com/products/${p.slug}`, lastModified: p.updatedAt })),
  ];
}
```
