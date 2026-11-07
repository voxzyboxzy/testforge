import { describe, expect, it } from 'vitest';
import { PIPELINE_PATH, PipelineMachine } from './state-machine';

describe('pipeline state machine', () => {
  it('walks the legal path from idle to done', () => {
    const machine = new PipelineMachine();
    for (const state of PIPELINE_PATH) machine.transition(state, '2026-01-01T00:00:00.000Z');
    expect(machine.state).toBe('done');
    expect(machine.history.map((event) => event.to)).toEqual(PIPELINE_PATH);
  });

  it('rejects a transition that skips classification', () => {
    const machine = new PipelineMachine();
    machine.transition('exploring');
    machine.transition('generating');
    expect(() => machine.transition('proposing')).toThrow(/Illegal transition generating -> proposing/);
  });

  it('can fail closed from any active state', () => {
    const machine = new PipelineMachine();
    machine.transition('exploring');
    machine.transition('failed');
    expect(machine.state).toBe('failed');
    expect(() => machine.transition('done')).toThrow(/Illegal transition/);
  });
});
