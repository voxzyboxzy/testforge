import { describe, expect, it } from 'vitest';
import { HeuristicProvider, OllamaProvider, createProvider } from './llm';

describe('llm providers', () => {
  it('uses the heuristic provider unless asked for Ollama', () => {
    expect(createProvider('heuristic').id).toBe('heuristic');
    expect(createProvider('ollama').id).toBe('ollama');
    expect(() => createProvider('remote-mystery')).toThrow(/Unknown/);
  });

  it('keeps the classifier rationale in heuristic mode', async () => {
    const provider = new HeuristicProvider();
    await expect(provider.explain({ kind: 'regression', rationale: 'frozen' })).resolves.toBe('frozen');
  });

  it('falls back to the deterministic rationale when Ollama is unreachable', async () => {
    const provider = new OllamaProvider({
      timeoutMs: 200,
      fetchImpl: async () => {
        throw new Error('connection refused');
      },
    });
    await expect(provider.explain({ kind: 'flake', rationale: 'retry passed' })).resolves.toBe('retry passed');
  });

  it('can rewrite wording without being asked to choose the class', async () => {
    const provider = new OllamaProvider({
      fetchImpl: async () =>
        ({
          ok: true,
          json: async () => ({ response: 'The retry passed, so this is a flake.' }),
        }) as Response,
    });
    await expect(provider.explain({ kind: 'flake', rationale: 'retry passed' })).resolves.toMatch(/flake/);
  });
});
