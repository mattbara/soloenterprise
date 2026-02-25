/**
 * Frontend Page Scaffolder
 *
 * Generates Next.js App Router pages: page.tsx (Server Component) + loading.tsx + error.tsx.
 * Supports page types: list, detail, form, dashboard.
 */

// ============================================================================
// Types
// ============================================================================

export type PageType = 'list' | 'detail' | 'form' | 'dashboard';

export interface PageScaffoldInput {
  /** Resource name (e.g., 'users') */
  resourceName: string;
  /** Page type determines the template */
  pageType: PageType;
  /** Route path segment (e.g., 'users' for /app/users/) */
  routeSegment: string;
  /** Whether this is a dynamic route (e.g., [id]) */
  isDynamic?: boolean;
}

export interface ScaffoldedFile {
  path: string;
  content: string;
}

// ============================================================================
// Page Scaffolder
// ============================================================================

/**
 * Generate Next.js App Router page files.
 */
export function scaffoldFrontendPage(input: PageScaffoldInput): ScaffoldedFile[] {
  const { resourceName, pageType, routeSegment, isDynamic } = input;
  const pascal = toPascalCase(resourceName);
  const basePath = isDynamic ? `src/app/${routeSegment}/[id]` : `src/app/${routeSegment}`;

  const files: ScaffoldedFile[] = [];

  // page.tsx
  files.push({
    path: `${basePath}/page.tsx`,
    content: generatePage(pascal, resourceName, pageType, isDynamic),
  });

  // loading.tsx
  files.push({
    path: `${basePath}/loading.tsx`,
    content: generateLoading(pascal),
  });

  // error.tsx
  files.push({
    path: `${basePath}/error.tsx`,
    content: generateError(pascal),
  });

  return files;
}

// ============================================================================
// Template Generators
// ============================================================================

function generatePage(pascal: string, resource: string, pageType: PageType, isDynamic?: boolean): string {
  switch (pageType) {
    case 'list':
      return generateListPage(pascal, resource);
    case 'detail':
      return generateDetailPage(pascal, resource);
    case 'form':
      return generateFormPage(pascal, resource, isDynamic);
    case 'dashboard':
      return generateDashboardPage(pascal, resource);
  }
}

function generateListPage(pascal: string, resource: string): string {
  return `// Server Component — data fetched server-side, passed as props
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '${pascal} List',
};

// TODO: Import your data fetching service
// import { list${pascal}s } from '@/services/${resource}-service';

export default async function ${pascal}ListPage() {
  // TODO: Fetch data server-side
  // const ${resource}s = await list${pascal}s();

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">${pascal}s</h1>
        {/* TODO: Add create button */}
      </div>

      {/* TODO: Render ${resource} list */}
      <div className="space-y-4">
        <p className="text-muted-foreground">No ${resource}s found.</p>
      </div>
    </div>
  );
}
`;
}

function generateDetailPage(pascal: string, resource: string): string {
  return `// Server Component — data fetched server-side
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

// TODO: Import your data fetching service
// import { get${pascal}ById } from '@/services/${resource}-service';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // TODO: Fetch and use actual name
  return { title: \`${pascal} \${id}\` };
}

export default async function ${pascal}DetailPage({ params }: Props) {
  const { id } = await params;

  // TODO: Fetch data server-side
  // const ${resource} = await get${pascal}ById(id);
  // if (!${resource}) notFound();

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold">${pascal} Detail</h1>

      {/* TODO: Render ${resource} details */}
      <p className="text-muted-foreground">ID: {id}</p>
    </div>
  );
}
`;
}

function generateFormPage(pascal: string, resource: string, isDynamic?: boolean): string {
  const title = isDynamic ? `Edit ${pascal}` : `Create ${pascal}`;

  return `// Server Component wrapper — client form component receives server data
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '${title}',
};

${isDynamic ? `interface Props {
  params: Promise<{ id: string }>;
}

export default async function ${pascal}FormPage({ params }: Props) {
  const { id } = await params;

  // TODO: Fetch existing data for editing
  // const ${resource} = await get${pascal}ById(id);

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Edit ${pascal}</h1>
      {/* TODO: Import and render ${pascal}Form client component */}
      {/* <${pascal}Form defaultValues={${resource}} /> */}
    </div>
  );
}` : `export default async function Create${pascal}Page() {
  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Create ${pascal}</h1>
      {/* TODO: Import and render ${pascal}Form client component */}
      {/* <${pascal}Form /> */}
    </div>
  );
}`}
`;
}

function generateDashboardPage(pascal: string, resource: string): string {
  return `// Server Component — fetches aggregated data
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '${pascal} Dashboard',
};

export default async function ${pascal}DashboardPage() {
  // TODO: Fetch aggregated stats server-side
  // const stats = await get${pascal}Stats();

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">${pascal} Dashboard</h1>

      {/* TODO: Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">0</p>
        </div>
      </div>

      {/* TODO: Charts and tables */}
    </div>
  );
}
`;
}

function generateLoading(pascal: string): string {
  return `export default function ${pascal}Loading() {
  return (
    <div className="container mx-auto py-8">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-1/2" />
      </div>
    </div>
  );
}
`;
}

function generateError(pascal: string): string {
  return `'use client';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ${pascal}Error({ error, reset }: Props) {
  return (
    <div className="container mx-auto py-8">
      <h2 className="text-xl font-bold text-destructive mb-4">Something went wrong</h2>
      <p className="text-muted-foreground mb-4">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}
`;
}

function toPascalCase(name: string): string {
  return name.replace(/(^|[-_])([a-z])/g, (_, _p, c) => c.toUpperCase());
}
