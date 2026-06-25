import { afterAll, expect, it } from 'vitest';

import { prisma } from '../../test/prisma.js';

it('migrates the schema into a clean, empty test database', async () => {
  // A successful count proves the `languages` table exists (schema migrated),
  // and 0 proves the test DB starts empty.
  const count = await prisma.language.count();
  expect(count).toBe(0);
});

afterAll(async () => {
  await prisma.$disconnect();
});
