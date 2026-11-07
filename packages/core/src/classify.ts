import type { ClassificationKind, Evidence } from './types';

export function classify(evidence: Evidence): { kind: ClassificationKind; rationale: string } {
  if (evidence.passedOnRetry) {
    return {
      kind: 'flake',
      rationale: `The test failed and then passed on the automatic retry without a source change. First error: ${evidence.message} Counted as a flake, not a product regression.`,
    };
  }

  if (evidence.locatorStrategy === 'testid' && evidence.standIns.length > 0 && !evidence.assertionReached) {
    const standIn = evidence.standIns[0];
    return {
      kind: 'locator-drift',
      rationale: `${evidence.locatorExpr} did not resolve (${evidence.message}). ${standIn.reason} Proposed locator: ${standIn.expr}. The acceptance assertion had not run. TestForge will only rewrite the locator.`,
    };
  }

  const parts = [evidence.message];
  if (evidence.expectedText) parts.push(`Expected text "${evidence.expectedText}".`);
  if (evidence.statusText) parts.push(`Visible status was "${evidence.statusText}".`);
  else if (evidence.expectedText) parts.push('No status element was visible.');
  if (evidence.alerts.length > 0) parts.push(`Alert text: ${evidence.alerts.join(' | ')}.`);
  if (evidence.expectedSubmissions != null && evidence.submissionCount != null) {
    parts.push(`Submissions were ${evidence.submissionCount}; the criteria expect ${evidence.expectedSubmissions}.`);
  }
  parts.push('Classified as a product regression. Editing the expected outcome, weakening the assertion, or patching the app is refused.');
  return { kind: 'regression', rationale: parts.join(' ') };
}
