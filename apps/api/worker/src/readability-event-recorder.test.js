import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventRecorder, recordQuestionEvent, recordAnswerEvent } from './index.js';

class MockKv {
  constructor() {
    this.store = new Map();
    this.putCalls = [];
  }

  async get(key) {
    return this.store.get(key) ?? null;
  }

  async put(key, value, options = {}) {
    this.putCalls.push({ key, value, options });
    this.store.set(key, value);
  }
}

const createEnv = (overrides = {}) => ({
  EVENT_LOGGING_ENABLED: 'true',
  EVENT_TTL_DAYS: '90',
  ...overrides,
});

describe('readability: event recording behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records question and answer in NDJSON sequence for the same date', async () => {
    const kv = new MockKv();
    const env = createEnv();

    await recordQuestionEvent(
      'q_1_aaaaaa',
      'client-x',
      'What is your stack?',
      { top_k: 3 },
      env,
      kv
    );
    await recordAnswerEvent(
      'a_1_bbbbbb',
      'q_1_aaaaaa',
      'client-x',
      'JavaScript and Python',
      [],
      42,
      'local',
      env,
      kv
    );

    const [key] = [...kv.store.keys()];
    const [questionLine, answerLine] = kv.store.get(key).split('\n');
    expect(JSON.parse(questionLine).type).toBe('question');
    expect(JSON.parse(answerLine).type).toBe('answer');
  });

  it('records feedback event through dedicated recorder workflow', async () => {
    const kv = new MockKv();
    const recorder = createEventRecorder(createEnv(), kv);

    await recorder.recordFeedback('f_1_aaaaaa', 'q_1_aaaaaa', 'a_1_aaaaaa', 'client-feedback', {
      sentiment: 'helpful',
      optionalNote: 'Very clear answer.',
    });

    const [key] = [...kv.store.keys()];
    const [line] = kv.store.get(key).split('\n');
    const feedback = JSON.parse(line);
    expect(feedback.type).toBe('feedback');
    expect(feedback.sentiment).toBe('helpful');
  });

  it('normalizes invalid feedback sentiment to neutral', async () => {
    const kv = new MockKv();
    const recorder = createEventRecorder(createEnv(), kv);

    await recorder.recordFeedback('f_2_bbbbbb', 'q_2_bbbbbb', 'a_2_bbbbbb', 'client-feedback', {
      sentiment: 'mixed',
    });

    const [key] = [...kv.store.keys()];
    const [line] = kv.store.get(key).split('\n');
    expect(JSON.parse(line).sentiment).toBe('neutral');
  });

  it('uses default 90-day TTL when EVENT_TTL_DAYS is invalid', async () => {
    const kv = new MockKv();
    await recordQuestionEvent(
      'q_1_aaaaaa',
      'client-z',
      'question',
      {},
      createEnv({ EVENT_TTL_DAYS: '-7' }),
      kv
    );
    expect(kv.putCalls[0].options.expirationTtl).toBe(90 * 24 * 60 * 60);
  });
});
