import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireEnv } from '../server/lib/required-env.ts';

test('returns injected values trimmed without mutating the environment', () => {
  const env = Object.freeze({ CERNERE_BASE_URL: ' https://auth.example.test/ ' });
  assert.equal(requireEnv('CERNERE_BASE_URL', env), 'https://auth.example.test/');
});

for (const value of [undefined, '', ' \t\n']) {
  test(`rejects missing or blank required values (${JSON.stringify(value)})`, () => {
    assert.throws(
      () => requireEnv('BIBLIOTHECA_PUBLIC_URL', {
        BIBLIOTHECA_PUBLIC_URL: value,
        UNRELATED_SECRET: 'must-not-appear',
      }),
      { message: 'Missing required environment variable: BIBLIOTHECA_PUBLIC_URL' },
    );
  });
}
