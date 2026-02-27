/**
 * Mock @soloenterprise/db
 * Provides minimal surface area so sandbox imports don't crash at module load.
 * Tests that need specific behavior override with vi.mock() at the test level.
 */

const chainTerminal = {
  then: (resolve: (value: unknown) => void) => resolve([]),
};

const whereChain = () => ({
  limit: () => chainTerminal,
  offset: () => ({ limit: () => chainTerminal, ...chainTerminal }),
  orderBy: () => ({ limit: () => chainTerminal, ...chainTerminal }),
  ...chainTerminal,
});

export const db = {
  query: new Proxy(
    {},
    {
      get: () => ({
        findMany: async () => [],
        findFirst: async () => null,
      }),
    },
  ),
  select: () => ({
    from: () => ({
      where: whereChain,
      innerJoin: () => ({ where: whereChain, ...chainTerminal }),
      leftJoin: () => ({ where: whereChain, ...chainTerminal }),
      ...chainTerminal,
    }),
  }),
  insert: () => ({
    values: () => ({
      returning: async () => [{ id: 1 }],
      onConflictDoNothing: () => ({
        returning: async () => [{ id: 1 }],
      }),
      onConflictDoUpdate: () => ({
        returning: async () => [{ id: 1 }],
      }),
      ...chainTerminal,
    }),
  }),
  update: () => ({
    set: () => ({
      where: async () => ({ rowCount: 1 }),
      ...chainTerminal,
    }),
  }),
  delete: () => ({
    where: async () => ({ rowCount: 1 }),
    ...chainTerminal,
  }),
};
