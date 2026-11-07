export const BUG_FLAGS = [
  'es-validation',
  'double-submit',
  'conditional-required',
  'a11y',
  'ui-refactor-submit',
  'ui-refactor-both',
  'flake',
] as const;

export type BugFlag = (typeof BUG_FLAGS)[number];

export function readFlags(search: string): Set<BugFlag> {
  const raw = new URLSearchParams(search).get('bugs') ?? '';
  const flags = new Set<BugFlag>();
  for (const part of raw.split(',')) {
    const flag = part.trim();
    if ((BUG_FLAGS as readonly string[]).includes(flag)) {
      flags.add(flag as BugFlag);
    }
  }
  return flags;
}

export function readLocale(search: string): 'en' | 'es' {
  return new URLSearchParams(search).get('lang') === 'es' ? 'es' : 'en';
}

export function readAttempt(search: string): number | null {
  const raw = new URLSearchParams(search).get('attempt');
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
