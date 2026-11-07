export interface ExplainRequest {
  kind: string;
  rationale: string;
}

export interface LlmProvider {
  readonly id: 'heuristic' | 'ollama';
  explain(input: ExplainRequest): Promise<string>;
}

export class HeuristicProvider implements LlmProvider {
  readonly id = 'heuristic' as const;

  async explain(input: ExplainRequest): Promise<string> {
    return input.rationale;
  }
}

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama' as const;

  constructor(
    private readonly options: {
      host?: string;
      model?: string;
      fetchImpl?: typeof fetch;
      timeoutMs?: number;
    } = {},
  ) {}

  async explain(input: ExplainRequest): Promise<string> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const host = this.options.host ?? process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
    const model = this.options.model ?? process.env.OLLAMA_MODEL ?? 'llama3.2';
    const timeoutMs = this.options.timeoutMs ?? 8000;
    try {
      const response = await fetchImpl(`${host.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          prompt: `You are a QA reporter. Rewrite the rationale in two plain sentences. Do not change the classification "${input.kind}". Do not suggest editing expected outcomes.\n\n${input.rationale}`,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return input.rationale;
      const payload = (await response.json()) as { response?: unknown };
      return typeof payload.response === 'string' && payload.response.trim() ? payload.response.trim() : input.rationale;
    } catch {
      return input.rationale;
    }
  }
}

export function createProvider(kind = process.env.TESTFORGE_LLM ?? 'heuristic'): LlmProvider {
  if (kind === 'heuristic' || kind === '' || kind == null) return new HeuristicProvider();
  if (kind === 'ollama') return new OllamaProvider();
  throw new Error(`Unknown TESTFORGE_LLM provider: ${kind}`);
}
