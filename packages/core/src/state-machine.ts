import type { PipelineEvent, PipelineState } from './types';

const TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  idle: ['exploring'],
  exploring: ['generating', 'failed'],
  generating: ['running', 'failed'],
  running: ['inspecting', 'failed'],
  inspecting: ['classifying', 'failed'],
  classifying: ['proposing', 'failed'],
  proposing: ['awaiting-approval', 'failed'],
  'awaiting-approval': ['done', 'failed'],
  done: [],
  failed: [],
};

export class PipelineMachine {
  state: PipelineState = 'idle';
  readonly history: PipelineEvent[] = [];

  transition(to: PipelineState, now = new Date().toISOString()): void {
    const allowed = TRANSITIONS[this.state];
    if (!allowed.includes(to)) {
      throw new Error(`Illegal transition ${this.state} -> ${to}`);
    }
    this.history.push({ from: this.state, to, at: now });
    this.state = to;
  }
}

export const PIPELINE_PATH: PipelineState[] = [
  'exploring',
  'generating',
  'running',
  'inspecting',
  'classifying',
  'proposing',
  'awaiting-approval',
  'done',
];
