import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { reviewRepair, type PolicyVerdict } from '../../core/src/policy';
import type { LocatorPlan } from './criteria';
import type { TestExecution } from '../../core/src/types';

export const GENERATED_SPEC = 'generated/northline.spec.ts';

export function unifiedDiff(before: string, after: string, file: string): string {
  const previous = before.split('\n');
  const next = after.split('\n');
  const header = [`--- a/${file}`, `+++ b/${file}`];
  if (previous.length !== next.length) {
    return [...header, '@@ full file @@', ...previous.map((line) => `-${line}`), ...next.map((line) => `+${line}`)].join('\n');
  }
  const lines = [...header];
  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] === next[index]) continue;
    lines.push(`@@ -${index + 1} +${index + 1} @@`);
    lines.push(`-${previous[index]}`);
    lines.push(`+${next[index]}`);
  }
  return lines.join('\n');
}

export function proposePlan(
  current: LocatorPlan,
  tests: TestExecution[],
  names: { en: string; es: string },
): LocatorPlan | null {
  let submit = current.submit;
  let confirmation = current.confirmation;
  let changed = false;
  for (const test of tests) {
    if (test.classification !== 'locator-drift' || !test.evidence) continue;
    if (test.evidence.target === 'submit' && submit.type === 'testid') {
      submit = { type: 'role-locale', role: 'button', en: names.en, es: names.es };
      changed = true;
    }
    if (test.evidence.target === 'confirmation' && confirmation.type === 'testid') {
      confirmation = { type: 'role', role: 'status' };
      changed = true;
    }
  }
  return changed ? { submit, confirmation } : null;
}

export function commitRepair(repoRoot: string, proposal: { file: string; before: string; after: string }): PolicyVerdict {
  const verdict = reviewRepair(proposal);
  if (!verdict.ok) {
    throw new Error(verdict.reasons.join(' '));
  }
  const relative = proposal.file.replaceAll('\\', '/');
  if (relative !== GENERATED_SPEC) {
    throw new Error('Repairs may only edit generated/northline.spec.ts.');
  }
  const full = path.resolve(repoRoot, relative);
  const allowed = path.resolve(repoRoot, 'generated');
  if (full !== path.join(allowed, 'northline.spec.ts')) {
    throw new Error('Repair path escaped the generated directory.');
  }
  mkdirSync(allowed, { recursive: true });
  writeFileSync(full, proposal.after);
  return verdict;
}
