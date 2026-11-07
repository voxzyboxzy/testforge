import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadCriteria } from './criteria';

describe('acceptance criteria', () => {
  const cases = loadCriteria('criteria/job-application.yaml');

  it('covers English, Spanish, accessibility, and the double submit', () => {
    expect(cases.map((item) => item.id)).toEqual([
      'en-happy-path',
      'es-happy-path',
      'en-rejects-invalid-email',
      'es-rejects-invalid-email',
      'en-remote-requires-timezone',
      'es-onsite-requires-office',
      'en-double-submit',
      'a11y-en',
      'a11y-es',
    ]);
    expect(cases.filter((item) => item.locale === 'en').length).toBeGreaterThan(0);
    expect(cases.filter((item) => item.locale === 'es').length).toBeGreaterThan(0);
  });

  it('is explained in the markdown criteria with the same ids', () => {
    const markdown = readFileSync('criteria/job-application.md', 'utf8');
    for (const testCase of cases) {
      expect(markdown).toContain(`## ${testCase.id}`);
    }
  });
});
