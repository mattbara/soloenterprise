# Frontend Engineer - Performance

<!-- Token Target: 600-800 tokens -->
<!-- Load When: component, page, image, layout, list, table, dashboard -->

## Images

Always use `next/image`. Never raw `<img>`:

```tsx
import Image from 'next/image';

// LCP image — mark as priority
<Image src={hero} alt="Hero banner" priority sizes="100vw" />

// Below-fold images — lazy by default, always add sizes
<Image src={thumb} alt="Thumbnail" sizes="(max-width: 768px) 50vw, 33vw" width={400} height={300} />
```

`sizes` is mandatory — without it, the browser downloads the largest variant.

## Code Splitting

```tsx
import dynamic from 'next/dynamic';

// Heavy components below the fold
const Chart = dynamic(() => import('@/components/chart'), {
  loading: () => <ChartSkeleton />,
});

// NEVER barrel-import from index files
// WRONG — loads everything in the barrel
import { Chart, Table, Form } from '@/components';

// CORRECT — direct imports, tree-shakeable
import { Chart } from '@/components/chart';
```

## Server vs Client Components

```tsx
// DEFAULT — Server Component (no 'use client', no JS shipped)
export default async function ProductList() {
  const products = await db.query.products.findMany();
  return <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>;
}

// Client Component ONLY when you need:
// - useState, useEffect, event handlers, browser APIs
// - Keep them small, push as far down the tree as possible
'use client';
export function AddToCartButton({ productId }: { productId: string }) {
  // Interactive logic only
}
```

## Fonts

```tsx
// app/layout.tsx — use next/font, never external stylesheet links
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'], display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html className={inter.className}>{children}</html>;
}
```

## Third-Party Scripts

```tsx
import Script from 'next/script';

// Non-critical: lazyOnload (after page is interactive)
<Script src="https://analytics.example.com/script.js" strategy="lazyOnload" />

// Critical (rare): beforeInteractive — only in layout.tsx
<Script src="/polyfill.js" strategy="beforeInteractive" />
```

## Database Queries

```tsx
// WRONG — N+1: one query per product in a loop
const products = await db.query.products.findMany();
for (const p of products) {
  const reviews = await db.query.reviews.findMany({ where: eq(reviews.productId, p.id) });
}

// CORRECT — single query with join
const products = await db.query.products.findMany({
  with: { reviews: true },
});
```

## Bundle Size

Flag any first-load JS over 100KB per route. Check with:
```bash
npx next build && npx @next/bundle-analyzer
```
