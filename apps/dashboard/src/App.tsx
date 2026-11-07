import { useEffect, useState } from 'react';
import { formatRate } from '../../../packages/core/src/scoreboard';
import type { Report, ScenarioResult, TestExecution } from '../../../packages/core/src/types';

function badgeClass(kind: string | undefined): string {
  if (kind === 'locator-drift') return 'badge drift';
  if (kind === 'flake') return 'badge flake';
  if (kind === 'regression') return 'badge regression';
  if (kind === 'passed') return 'badge pass';
  return 'badge';
}

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="diff" tabIndex={0}>
      {diff.split('\n').map((line, index) => {
        const tone = line.startsWith('+') && !line.startsWith('+++') ? 'add' : line.startsWith('-') && !line.startsWith('---') ? 'del' : '';
        return (
          <span key={`${index}-${line.slice(0, 12)}`} className={tone}>
            {line}
            {'\n'}
          </span>
        );
      })}
    </pre>
  );
}

export function App() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [testId, setTestId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/report.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Report request failed (${response.status})`);
        return response.json() as Promise<Report>;
      })
      .then((data) => {
        const focus = new URLSearchParams(window.location.search).get('focus');
        const scenario =
          data.scenarios.find((item) => item.id === focus) ??
          data.scenarios.find((item) => item.tests.some((test) => test.status === 'failed')) ??
          data.scenarios[0];
        setReport(data);
        setScenarioId(scenario?.id ?? null);
        setTestId(scenario?.tests.find((test) => test.status === 'failed')?.id ?? scenario?.tests[0]?.id ?? null);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Could not load the report');
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <main className="shell">
        <h1>TestForge</h1>
        <p role="alert">{error}. Run `npm run benchmark` to generate the report.</p>
      </main>
    );
  }

  if (!report || !scenarioId) {
    return (
      <main className="shell">
        <h1>TestForge</h1>
        <p>Loading the latest benchmark…</p>
      </main>
    );
  }

  const scenario = report.scenarios.find((item) => item.id === scenarioId) ?? report.scenarios[0];
  const selectedTest = scenario.tests.find((test) => test.id === testId) ?? scenario.tests[0];

  return (
    <div className="shell">
      <header className="mast">
        <div>
          <p className="kicker">QA agent bench</p>
          <h1>TestForge</h1>
        </div>
        <div className="meta">
          <span className="badge pass">{report.provider}</span>
          <span>{report.scoreboard.baselinePassed}/{report.scoreboard.baselineTotal} baseline passed</span>
          <span>EN {report.coverage.en.baselinePassed}/{report.coverage.en.total}</span>
          <span>ES {report.coverage.es.baselinePassed}/{report.coverage.es.total}</span>
          <span>axe serious {report.exploration.axeSerious.en + report.exploration.axeSerious.es}</span>
        </div>
      </header>

      <section className="metrics" aria-label="Scoreboard">
        <Metric label="Detection" value={formatRate(report.scoreboard.detection)} detail={report.formulas.detection} />
        <Metric label="False positives" value={formatRate(report.scoreboard.falsePositives)} detail={report.formulas.falsePositives} />
        <Metric label="Flake rate" value={formatRate(report.scoreboard.flakes)} detail={report.formulas.flakes} />
        <Metric label="Repair accuracy" value={formatRate(report.scoreboard.repair)} detail={report.formulas.repair} />
        <Metric label="Unsafe repairs blocked" value={formatRate(report.scoreboard.unsafeRepairs)} detail={report.formulas.unsafe} />
      </section>

      <ol className="pipeline">
        {report.pipeline.map((event) => (
          <li key={`${event.from}-${event.to}`}>{event.to}</li>
        ))}
      </ol>

      <div className="workspace">
        <section aria-label="Scenarios">
          <h2>Runs</h2>
          <ul className="runs">
            {report.scenarios.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={item.id === scenario.id}
                  onClick={() => {
                    setScenarioId(item.id);
                    setTestId(item.tests.find((test) => test.status === 'failed')?.id ?? item.tests[0]?.id ?? null);
                  }}
                >
                  <span className={item.finalStatus === 'passed' && item.tests.every((test) => test.status === 'passed') ? 'dot pass' : 'dot fail'} />
                  <span>
                    <strong>{item.id}</strong>
                    <small>{item.kind}</small>
                  </span>
                  <em>{item.tests.filter((test) => test.status === 'failed').length} failed</em>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="detail" aria-live="polite">
          <ScenarioDetail scenario={scenario} test={selectedTest} onSelectTest={setTestId} />
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric">
      <h2>{label}</h2>
      <p>{value}</p>
      <small>{detail}</small>
    </article>
  );
}

function ScenarioDetail({
  scenario,
  test,
  onSelectTest,
}: {
  scenario: ScenarioResult;
  test: TestExecution | undefined;
  onSelectTest: (id: string) => void;
}) {
  return (
    <>
      <p className="kicker">{scenario.kind}</p>
      <h2>{scenario.id}</h2>
      <p>{scenario.description}</p>
      <p className="flags">
        {scenario.kind === 'product-bug' ? (scenario.detected ? 'Detected as a regression' : 'Not detected') : null}
        {scenario.kind === 'ui-change' ? (scenario.repairAccurate ? 'Locator repair held' : 'Repair did not hold') : null}
        {scenario.bugs.length > 0 ? ` · flags: ${scenario.bugs.join(', ')}` : ' · no flags'}
      </p>
      <div className="test-row">
        {scenario.tests.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === test?.id}
            className={badgeClass(item.status === 'passed' ? 'passed' : item.classification)}
            onClick={() => onSelectTest(item.id)}
          >
            {item.id}
          </button>
        ))}
      </div>
      {test && <TestDetail test={test} />}
      {scenario.repairs.length > 0 && (
        <div className="repairs">
          <h3>Proposed repairs</h3>
          {scenario.repairs.map((repair) => (
            <article key={repair.pass}>
              <p>
                Pass {repair.pass} · {repair.policyOk ? 'policy approved' : 'policy blocked'} · rerun {repair.rerunPassed ? 'passed' : 'failed'}
                {repair.playwrightConfirmed == null ? '' : repair.playwrightConfirmed ? ' · Playwright confirmed' : ' · Playwright failed'}
              </p>
              {repair.policyReasons.length > 0 && <p className="reasons">{repair.policyReasons.join(' ')}</p>}
              <DiffView diff={repair.diff} />
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function TestDetail({ test }: { test: TestExecution }) {
  const evidence = test.evidence;
  return (
    <article className="evidence">
      <h3>
        {test.title} <span className={badgeClass(test.status === 'passed' ? 'passed' : test.classification)}>{test.status === 'passed' ? 'passed' : test.classification}</span>
      </h3>
      {test.rationale && <p>{test.rationale}</p>}
      {evidence && (
        <>
          <dl>
            <div>
              <dt>Locator</dt>
              <dd>{evidence.locatorExpr}</dd>
            </div>
            <div>
              <dt>Submissions</dt>
              <dd>
                {evidence.submissionCount ?? '—'}
                {evidence.expectedSubmissions != null ? ` / expected ${evidence.expectedSubmissions}` : ''}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{evidence.statusText ?? 'none'}</dd>
            </div>
            <div>
              <dt>Alerts</dt>
              <dd>{evidence.alerts.join(' | ') || 'none'}</dd>
            </div>
          </dl>
          {evidence.trace.length > 0 && (
            <ol className="trace">
              {evidence.trace.map((step, index) => (
                <li key={`${index}-${step}`}>{step}</li>
              ))}
            </ol>
          )}
          {evidence.domExcerpt.length > 0 && <pre className="dom">{evidence.domExcerpt.join('\n')}</pre>}
          {evidence.screenshot && <img src={evidence.screenshot} alt={`Failure screenshot for ${test.id}`} />}
        </>
      )}
    </article>
  );
}
