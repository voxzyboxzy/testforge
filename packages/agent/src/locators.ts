import type { Locator, Page } from '@playwright/test';
import type { ConfirmationPlan, LocatorPlan, Locale, SubmitPlan } from './criteria';

export function tsString(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

export function submitExpr(plan: SubmitPlan): string {
  if (plan.type === 'testid') return `page.getByTestId(${tsString(plan.id)})`;
  return `page.getByRole('button', { name: locale === 'es' ? ${tsString(plan.es)} : ${tsString(plan.en)}, exact: true })`;
}

export function confirmationExpr(plan: ConfirmationPlan): string {
  if (plan.type === 'testid') return `page.getByTestId(${tsString(plan.id)})`;
  return `page.getByRole('status')`;
}

export function submitLocator(page: Page, plan: SubmitPlan, locale: Locale): Locator {
  if (plan.type === 'testid') return page.getByTestId(plan.id);
  return page.getByRole(plan.role, { name: locale === 'es' ? plan.es : plan.en, exact: true });
}

export function confirmationLocator(page: Page, plan: ConfirmationPlan): Locator {
  if (plan.type === 'testid') return page.getByTestId(plan.id);
  return page.getByRole(plan.role);
}

export function caseUrl(baseURL: string, locale: Locale, bugs: string[], attempt: number | null): string {
  const url = new URL(baseURL);
  url.searchParams.set('lang', locale);
  if (bugs.length > 0) url.searchParams.set('bugs', bugs.join(','));
  if (attempt != null) url.searchParams.set('attempt', String(attempt));
  return url.toString();
}

export function describePlanChange(before: LocatorPlan, after: LocatorPlan): string[] {
  const changes: string[] = [];
  if (submitExpr(before.submit) !== submitExpr(after.submit)) {
    changes.push(`${submitExpr(before.submit)} -> ${submitExpr(after.submit)}`);
  }
  if (confirmationExpr(before.confirmation) !== confirmationExpr(after.confirmation)) {
    changes.push(`${confirmationExpr(before.confirmation)} -> ${confirmationExpr(after.confirmation)}`);
  }
  return changes;
}
