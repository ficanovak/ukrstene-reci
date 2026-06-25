/**
 * Default Postgres schema for the app. Migrations create tables here, so the
 * runtime client must target it too (see parseSchemaFromUrl).
 */
export const DEFAULT_SCHEMA = 'ukrstene';

/**
 * Read the `?schema=` query param off a Postgres connection string.
 *
 * The `?schema=` param is a Prisma-ism; the underlying pg driver
 * (@prisma/adapter-pg) ignores it and does NOT set Prisma's `schemaName` from
 * it. We must parse it ourselves and pass `{ schema }` to the adapter so
 * generated queries hit the isolated `ukrstene` schema (where migrations live)
 * instead of falling back to `public`.
 *
 * Falls back to {@link DEFAULT_SCHEMA} when the param is absent or the URL is
 * missing/unparseable, so the client never silently lands on `public`.
 */
export function parseSchemaFromUrl(url: string | undefined): string {
  if (!url) return DEFAULT_SCHEMA;
  try {
    return new URL(url).searchParams.get('schema') ?? DEFAULT_SCHEMA;
  } catch {
    return DEFAULT_SCHEMA;
  }
}
