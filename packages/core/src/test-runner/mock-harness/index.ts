/**
 * Mock harness barrel exports.
 *
 * This file documents what mocks are available. For Vitest resolve.alias,
 * each file is aliased individually:
 *
 *   '@soloenterprise/db'     → mock-harness/db.ts
 *   'next/navigation'        → mock-harness/next-navigation.ts
 *   'next/image'             → mock-harness/next-image.ts
 *   'next/headers'           → mock-harness/next-headers.ts
 *   '@soloenterprise/core/*' → mock-harness/core-services.ts
 */

export { db } from './db';
export {
  useRouter,
  usePathname,
  useSearchParams,
  redirect,
  notFound,
  useParams,
} from './next-navigation';
export { default as Image } from './next-image';
export { cookies, headers } from './next-headers';
export {
  createQueue,
  acquireLock,
  releaseLock,
  createSession,
  endSession,
} from './core-services';
