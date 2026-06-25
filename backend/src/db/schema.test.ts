import { afterAll, beforeEach, expect, it } from 'vitest';

import { prisma, truncateAll } from '../../test/prisma.js';

beforeEach(async () => {
  // Other test files seed this shared DB; truncate first so the emptiness
  // assertion reflects a truly clean slate regardless of file execution order.
  await truncateAll();
});

it('migrates the schema into a clean, empty test database', async () => {
  // A successful count proves the `languages` table exists (schema migrated),
  // and 0 proves the test DB is empty after truncation.
  const count = await prisma.language.count();
  expect(count).toBe(0);
});

afterAll(async () => {
  await prisma.$disconnect();
});
