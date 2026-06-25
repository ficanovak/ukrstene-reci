import { afterAll, beforeEach, expect, it } from 'vitest';

import { seed } from '../../prisma/seed.js';
import { prisma, truncateAll } from '../../test/prisma.js';

beforeEach(async () => {
  // Clean slate before each test. This also exercises the truncateAll helper.
  await truncateAll();
});

it('seeds exactly the 5 supported languages', async () => {
  await seed(prisma);

  const count = await prisma.language.count();
  expect(count).toBe(5);
});

it('seeds each language with the correct supported scripts', async () => {
  await seed(prisma);

  const byCode = async (code: string) =>
    prisma.language.findUniqueOrThrow({ where: { code } });

  expect((await byCode('sr')).supportedScripts).toEqual(['cyr', 'lat']);
  expect((await byCode('hr')).supportedScripts).toEqual(['lat']);
  expect((await byCode('bs')).supportedScripts).toEqual(['lat']);
  expect((await byCode('me')).supportedScripts).toEqual(['lat']);
  expect((await byCode('mk')).supportedScripts).toEqual(['cyr']);
});

it('is idempotent: running twice still yields exactly 5 languages', async () => {
  await seed(prisma);
  await seed(prisma);

  const count = await prisma.language.count();
  expect(count).toBe(5);
});

afterAll(async () => {
  await prisma.$disconnect();
});
