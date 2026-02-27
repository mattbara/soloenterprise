/**
 * Mock @soloenterprise/core/* services
 * Stubs for queue, locks, and other runtime services.
 */

const noop = () => {};
const asyncNoop = async () => {};

// --- Task Queue mock ---
export function createQueue() {
  return {
    add: asyncNoop,
    process: noop,
    close: asyncNoop,
    getJob: async () => null,
    getJobs: async () => [],
  };
}

// --- File Lock mock ---
export async function acquireLock() {
  return true;
}

export async function releaseLock() {
  return true;
}

// --- Agent Session mock ---
export async function createSession() {
  return { id: 'mock-session-id' };
}

export async function endSession() {}
