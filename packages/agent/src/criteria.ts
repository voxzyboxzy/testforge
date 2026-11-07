import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export type Locale = 'en' | 'es';

export type Step =
  | { kind: 'fill'; label: string; value: string }
  | { kind: 'select'; label: string; value: string }
  | { kind: 'check'; name: string }
  | { kind: 'click'; name: string; count: number }
  | { kind: 'axe' };

export interface Expectation {
  confirmation?: string;
  alert?: string;
  submissions?: number;
  noConfirmation?: boolean;
  axe?: boolean;
}

export interface AcceptanceCase {
  id: string;
  title: string;
  locale: Locale;
  steps: Step[];
  expect: Expectation;
}

export type SubmitPlan =
  | { type: 'testid'; id: string }
  | { type: 'role-locale'; role: 'button'; en: string; es: string };

export type ConfirmationPlan = { type: 'testid'; id: string } | { type: 'role'; role: 'status' };

export interface LocatorPlan {
  submit: SubmitPlan;
  confirmation: ConfirmationPlan;
}

function fail(message: string): never {
  throw new Error(message);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string`);
  return value;
}

function parseSteps(raw: unknown, id: string): Step[] {
  if (!Array.isArray(raw) || raw.length === 0) fail(`Case ${id} needs steps`);
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') fail(`Case ${id} step ${index} is invalid`);
    const record = item as Record<string, unknown>;
    if (record.axe === true) return { kind: 'axe' };
    if (record.fill && typeof record.fill === 'object') {
      const fill = record.fill as Record<string, unknown>;
      return { kind: 'fill', label: requiredString(fill.label, `${id} fill label`), value: String(fill.value ?? '') };
    }
    if (record.select && typeof record.select === 'object') {
      const select = record.select as Record<string, unknown>;
      return {
        kind: 'select',
        label: requiredString(select.label, `${id} select label`),
        value: requiredString(select.value, `${id} select value`),
      };
    }
    if (record.check && typeof record.check === 'object') {
      const check = record.check as Record<string, unknown>;
      return { kind: 'check', name: requiredString(check.name, `${id} check name`) };
    }
    if (record.click && typeof record.click === 'object') {
      const click = record.click as Record<string, unknown>;
      const count = click.count == null ? 1 : Number(click.count);
      if (!Number.isInteger(count) || count < 1) fail(`Case ${id} click count is invalid`);
      return { kind: 'click', name: requiredString(click.name, `${id} click name`), count };
    }
    fail(`Case ${id} step ${index} was not recognized`);
  });
}

function parseExpect(raw: unknown, steps: Step[], id: string): Expectation {
  if (steps.some((step) => step.kind === 'axe')) return { axe: true };
  if (!raw || typeof raw !== 'object') fail(`Case ${id} needs expect`);
  const record = raw as Record<string, unknown>;
  const expectation: Expectation = {};
  if (typeof record.confirmation === 'string') expectation.confirmation = record.confirmation;
  if (typeof record.alert === 'string') expectation.alert = record.alert;
  if (typeof record.submissions === 'number') expectation.submissions = record.submissions;
  if (record.noConfirmation === true) expectation.noConfirmation = true;
  if (!expectation.confirmation && !expectation.alert && expectation.submissions == null) {
    fail(`Case ${id} expect has no assertion`);
  }
  return expectation;
}

export function loadCriteria(file: string): AcceptanceCase[] {
  const document = parse(readFileSync(file, 'utf8')) as { cases?: unknown };
  if (!document || !Array.isArray(document.cases)) fail('Criteria file has no cases');
  const cases = document.cases.map((item, index) => {
    if (!item || typeof item !== 'object') fail(`Case ${index} is invalid`);
    const record = item as Record<string, unknown>;
    const id = requiredString(record.id, 'id');
    const locale = record.locale === 'es' ? 'es' : record.locale === 'en' ? 'en' : fail(`${id} locale must be en or es`);
    const steps = parseSteps(record.steps, id);
    return {
      id,
      title: requiredString(record.title, `${id} title`),
      locale,
      steps,
      expect: parseExpect(record.expect, steps, id),
    } satisfies AcceptanceCase;
  });
  const ids = new Set(cases.map((item) => item.id));
  if (ids.size !== cases.length) fail('Criteria ids must be unique');
  return cases;
}
