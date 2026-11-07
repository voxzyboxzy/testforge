export interface PolicyVerdict {
  ok: boolean;
  reasons: string[];
}

const LOCATOR_PATTERN = /page\.(?:getByTestId|getByRole|getByLabel|getByText|getByPlaceholder|locator)\(/g;

function findMatchingParen(source: string, open: number): number {
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('Unbalanced locator call');
}

/** Replace locator calls with a placeholder so the rest of the test can be compared exactly. */
export function maskLocators(source: string): string {
  let out = '';
  let cursor = 0;
  for (const match of source.matchAll(LOCATOR_PATTERN)) {
    const start = match.index ?? 0;
    const open = start + match[0].length - 1;
    const end = findMatchingParen(source, open);
    out += source.slice(cursor, start);
    out += '«LOC»';
    cursor = end + 1;
  }
  out += source.slice(cursor);
  return out;
}

const ALLOWED_FILE = 'generated/northline.spec.ts';

/**
 * A repair may change locators in the generated Playwright spec.
 * It may not weaken an assertion, change an expected outcome, skip a test, or edit the app.
 */
export function reviewRepair(input: { file: string; before: string; after: string }): PolicyVerdict {
  const reasons: string[] = [];
  const file = input.file.replaceAll('\\', '/');
  if (file !== ALLOWED_FILE || file.split('/').includes('..')) {
    reasons.push('Repairs may only edit generated/northline.spec.ts.');
  }
  if (file.includes('apps/demo-app') || file.includes('criteria/')) {
    reasons.push('Repairs may not edit the application or the acceptance criteria.');
  }

  const banned = ['test.skip', 'test.fixme', '.only(', 'test.fail(', 'eslint-disable'];
  for (const token of banned) {
    if (input.after.includes(token) && !input.before.includes(token)) {
      reasons.push(`Repair introduces forbidden token ${token}.`);
    }
  }

  if (input.before === input.after) {
    reasons.push('Repair does not change the test.');
  } else if (maskLocators(input.before) !== maskLocators(input.after)) {
    reasons.push('Repair changes more than locators. Assertions and expected outcomes stay frozen.');
  }

  const beforeExpects = input.before.split('expect(').length - 1;
  const afterExpects = input.after.split('expect(').length - 1;
  if (afterExpects < beforeExpects) {
    reasons.push('Repair removes assertions.');
  }

  return { ok: reasons.length === 0, reasons };
}
