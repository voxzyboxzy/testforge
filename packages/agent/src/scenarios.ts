import type { ScenarioKind } from '../../core/src/types';

export interface ScenarioSpec {
  id: string;
  kind: ScenarioKind;
  bugs: string[];
  description: string;
}

export const SCENARIOS: ScenarioSpec[] = [
  {
    id: 'baseline',
    kind: 'baseline',
    bugs: [],
    description: 'No seeded bugs. Every generated test should pass.',
  },
  {
    id: 'es-validation',
    kind: 'product-bug',
    bugs: ['es-validation'],
    description: 'Spanish email validation only accepts a bare local@domain.com address, so sofia.reyes@correo.es is rejected.',
  },
  {
    id: 'double-submit',
    kind: 'product-bug',
    bugs: ['double-submit'],
    description: 'The inbox stops deduplicating the idempotency key, so one double click stores two applications.',
  },
  {
    id: 'conditional-required',
    kind: 'product-bug',
    bugs: ['conditional-required'],
    description: 'Remote applications no longer require a timezone.',
  },
  {
    id: 'a11y',
    kind: 'product-bug',
    bugs: ['a11y'],
    description: 'The logo drops its alt text and the email field drops its label.',
  },
  {
    id: 'ui-refactor-submit',
    kind: 'ui-change',
    bugs: ['ui-refactor-submit'],
    description: 'Held-out UI change: the submit button keeps its accessible name and behavior, but its data-testid becomes send-application.',
  },
  {
    id: 'ui-refactor-both',
    kind: 'ui-change',
    bugs: ['ui-refactor-both'],
    description: 'Held-out UI change: submit and confirmation test ids both change. Visible copy, roles, and behavior stay the same.',
  },
  {
    id: 'flake',
    kind: 'flake',
    bugs: ['flake'],
    description: 'Attempt 1 suppresses the confirmation banner. The automatic retry, attempt 2, renders it.',
  },
];
