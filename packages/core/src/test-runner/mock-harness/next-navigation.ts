/**
 * Mock next/navigation
 * Plain no-op functions — no vitest dependency.
 * Tests that need spy behavior use vi.mock() at the test level.
 */

const noop = () => {};

export const useRouter = () => ({
  push: noop,
  replace: noop,
  refresh: noop,
  back: noop,
  forward: noop,
  prefetch: noop,
});

export const usePathname = () => '/';

export const useSearchParams = () => new URLSearchParams();

export const redirect = noop;

export const notFound = noop;

export const useParams = () => ({});

export const useSelectedLayoutSegment = () => null;

export const useSelectedLayoutSegments = () => [];
