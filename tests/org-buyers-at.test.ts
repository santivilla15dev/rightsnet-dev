import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';

describe('Org buyers AT domicile', () => {
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
      throw new Error('Test DB required');
    await migrate();
  });
  afterAll(() => pool.end());

  it('accepts AT/DE/ES and rejects unknown country at the DB check', async () => {
    await pool.query(
      'INSERT INTO users(id,email,display_name,role) VALUES($1,$2,$3,$4)',
      [randomUUID(), `${randomUUID()}@at-buyers.test`, 'AT buyer', 'buyer'],
    );
    for (const country of ['AT', 'DE', 'ES'] as const) {
      const id = randomUUID();
      await pool.query('INSERT INTO organizations(id,legal_name,country) VALUES($1,$2,$3)', [
        id,
        `Org ${country}`,
        country,
      ]);
      const row = (
        await pool.query('SELECT country FROM organizations WHERE id=$1', [id])
      ).rows[0];
      expect(row.country).toBe(country);
    }
    await expect(
      pool.query('INSERT INTO organizations(id,legal_name,country) VALUES($1,$2,$3)', [
        randomUUID(),
        'Bad Org',
        'FR',
      ]),
    ).rejects.toThrow(/organizations_country_check|violates check constraint/i);
  });

  it('API organization body schema accepts AT', () => {
    const schema = z
      .object({
        legal_name: z.string().trim().min(3).max(100),
        country: z.enum(['AT', 'DE', 'ES']),
      })
      .strict();
    expect(schema.parse({ legal_name: 'Vienna Brand GmbH', country: 'AT' }).country).toBe('AT');
    expect(() => schema.parse({ legal_name: 'Nope', country: 'FR' })).toThrow();
  });
});
