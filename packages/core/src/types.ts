export type PipelineState =
  | 'idle'
  | 'exploring'
  | 'generating'
  | 'running'
  | 'inspecting'
  | 'classifying'
  | 'proposing'
  | 'awaiting-approval'
  | 'done'
  | 'failed';

export type ClassificationKind = 'locator-drift' | 'regression' | 'flake';

export type ScenarioKind = 'baseline' | 'product-bug' | 'ui-change' | 'flake';

export type LocatorStrategy = 'testid' | 'label' | 'role' | 'css' | 'none';

export interface StandIn {
  expr: string;
  reason: string;
}

export interface Evidence {
  target: 'submit' | 'confirmation' | 'alert' | 'count' | 'axe' | 'other';
  locatorStrategy: LocatorStrategy;
  locatorExpr: string;
  message: string;
  passedOnRetry: boolean;
  assertionReached: boolean;
  expectedText?: string;
  statusText: string | null;
  alerts: string[];
  submissionCount: number | null;
  expectedSubmissions?: number;
  standIns: StandIn[];
  domExcerpt: string[];
  trace: string[];
  screenshot?: string;
}

export interface TestExecution {
  id: string;
  title: string;
  locale: 'en' | 'es';
  status: 'passed' | 'failed';
  durationMs: number;
  classification?: ClassificationKind;
  rationale?: string;
  retryStatus?: 'passed' | 'failed';
  evidence?: Evidence;
}

export interface RepairRecord {
  pass: number;
  file: string;
  diff: string;
  policyOk: boolean;
  policyReasons: string[];
  rerunPassed: boolean;
  playwrightConfirmed: boolean | null;
}

export interface ScenarioResult {
  id: string;
  kind: ScenarioKind;
  bugs: string[];
  description: string;
  tests: TestExecution[];
  repairs: RepairRecord[];
  detected: boolean;
  repairAccurate: boolean;
  finalStatus: 'passed' | 'failed';
}

export interface Rate {
  count: number;
  total: number;
  rate: number;
}

export interface Scoreboard {
  detection: Rate;
  falsePositives: Rate;
  flakes: Rate;
  repair: Rate;
  unsafeRepairs: Rate;
  baselinePassed: number;
  baselineTotal: number;
}

export interface ExplorationSummary {
  controls: number;
  locales: Array<'en' | 'es'>;
  submitTestId: string;
  confirmationTestId: string;
  submitNames: { en: string; es: string };
  axeSerious: { en: number; es: number };
}

export interface PipelineEvent {
  from: PipelineState;
  to: PipelineState;
  at: string;
}

export interface Report {
  version: 1;
  project: 'testforge';
  provider: 'heuristic' | 'ollama';
  generatedAt: string;
  commitHint: string;
  baseURL: string;
  appSourceSha256: string;
  appSourceUnchanged: boolean;
  exploration: ExplorationSummary;
  pipeline: PipelineEvent[];
  scenarios: ScenarioResult[];
  scoreboard: Scoreboard;
  coverage: {
    en: { total: number; baselinePassed: number };
    es: { total: number; baselinePassed: number };
  };
  generatedTestExcerpt: string;
  formulas: {
    detection: string;
    falsePositives: string;
    flakes: string;
    repair: string;
    unsafe: string;
  };
}
