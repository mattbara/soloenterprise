/**
 * Mock next/headers
 * Provides cookies() and headers() with minimal no-crash surface area.
 */

export function cookies() {
  return {
    get: () => null,
    getAll: () => [],
    set: () => {},
    delete: () => {},
    has: () => false,
  };
}

export function headers() {
  return {
    get: () => null,
    has: () => false,
    entries: () => [] as [string, string][],
    forEach: () => {},
    keys: () => [] as string[],
    values: () => [] as string[],
  };
}
