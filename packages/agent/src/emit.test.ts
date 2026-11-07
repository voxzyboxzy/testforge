import { describe, expect, it } from 'vitest';
import { reviewRepair } from '../../core/src/policy';
import { loadCriteria } from './criteria';
import { emitSpec } from './emit';

const cases = loadCriteria('criteria/job-application.yaml');
const brittle = emitSpec(cases, {
  submit: { type: 'testid', id: 'submit-application' },
  confirmation: { type: 'testid', id: 'confirmation-banner' },
});
const repaired = emitSpec(cases, {
  submit: { type: 'role-locale', role: 'button', en: 'Submit application', es: 'Enviar solicitud' },
  confirmation: { type: 'role', role: 'status' },
});

describe('spec emitter', () => {
  it('keeps every expected outcome from the criteria', () => {
    for (const testCase of cases) {
      expect(brittle).toContain(`case:${testCase.id}`);
      if (testCase.expect.confirmation) expect(brittle).toContain(testCase.expect.confirmation);
      if (testCase.expect.alert) expect(brittle).toContain(testCase.expect.alert);
    }
    expect(brittle).toContain("getByTestId('submit-application')");
    expect(brittle).toContain("getByTestId('confirmation-banner')");
  });

  it('allows a locator-only plan change and rejects an edited expectation', () => {
    const verdict = reviewRepair({ file: 'generated/northline.spec.ts', before: brittle, after: repaired });
    expect(verdict.ok).toBe(true);
    const weakened = repaired.replace('Application received', 'Saved');
    expect(reviewRepair({ file: 'generated/northline.spec.ts', before: brittle, after: weakened }).ok).toBe(false);
  });
});
