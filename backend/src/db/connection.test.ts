import { describe, expect, it } from 'vitest';

import { DEFAULT_SCHEMA, parseSchemaFromUrl } from './connection.js';

describe('parseSchemaFromUrl', () => {
  it('reads the schema from the ?schema= query param', () => {
    expect(parseSchemaFromUrl('postgres://u:p@host:5432/db?schema=ukrstene')).toBe('ukrstene');
  });

  it('reads a non-default schema verbatim', () => {
    expect(parseSchemaFromUrl('postgres://u:p@host:5432/db?schema=ukrstene_test')).toBe(
      'ukrstene_test',
    );
  });

  it('falls back to the default when the param is absent', () => {
    expect(parseSchemaFromUrl('postgres://u:p@host:5432/db')).toBe(DEFAULT_SCHEMA);
  });

  it('falls back to the default when the URL is undefined', () => {
    expect(parseSchemaFromUrl(undefined)).toBe(DEFAULT_SCHEMA);
  });

  it('falls back to the default when the URL is unparseable', () => {
    expect(parseSchemaFromUrl('not a url')).toBe(DEFAULT_SCHEMA);
  });
});
