import { getEventTtlSeconds } from './event-policy.js';

/**
 * Event persistence + shaping helpers.
 *
 * This module intentionally separates:
 * 1) storage append concerns (`createEventLogRepository`),
 * 2) event payload shaping (`create*Event` helpers),
 * 3) higher-level record operations (`recordQuestionEvent` / `recordAnswerEvent`).
 */

/**
 * Creates a small repository abstraction over KV append semantics.
 *
 * Events are grouped by day (`events:YYYY-MM-DD`) as newline-delimited JSON to
 * keep writes simple and analytics-friendly.
 */
function createEventLogRepository(kv, ttlSeconds) {
  return {
    async append(event) {
      const dateKey = new Date().toISOString().split('T')[0];
      const kvKey = `events:${dateKey}`;

      let existing = '';
      try {
        existing = (await kv.get(kvKey)) || '';
      } catch (_error) {
        // Read failures are tolerated for best-effort event logging.
      }

      const nextRecord = `${existing}${existing ? '\n' : ''}${JSON.stringify(event)}`;
      await kv.put(kvKey, nextRecord, { expirationTtl: ttlSeconds });
    },
  };
}

/**
 * Shared envelope for all event types.
 */
const buildCommonFields = (eventId, clientId) => ({
  eventId,
  timestamp: new Date().toISOString(),
  clientId,
});

/**
 * Allows only known feedback sentiment values to keep analytics dimensions clean.
 */
const normalizeFeedbackSentiment = (feedbackPayload) =>
  ['helpful', 'unhelpful'].includes(feedbackPayload.sentiment)
    ? feedbackPayload.sentiment
    : 'neutral';

/**
 * Shapes a question event and trims unbounded user content.
 */
const createQuestionEvent = (eventId, clientId, question, payload) => ({
  ...buildCommonFields(eventId, clientId),
  type: 'question',
  question: String(question ?? '').substring(0, 2_000),
  topK: payload?.top_k || 5,
  humorMode: payload?.humor_mode || 'clean_professional',
});

/**
 * Shapes an answer event with lightweight derivations used by dashboards.
 */
const createAnswerEvent = (
  eventId,
  questionEventId,
  clientId,
  answer,
  citations,
  latencyMs,
  backendMode
) => ({
  ...buildCommonFields(eventId, clientId),
  type: 'answer',
  questionEventId,
  answer: String(answer ?? '').substring(0, 4_000),
  citationCount: (citations || []).length,
  answerHash: String(answer ?? '').substring(0, 20),
  durationMs: latencyMs || 0,
  backendMode: backendMode || 'local',
});

/**
 * Shapes a feedback event while constraining optional free-form notes.
 */
const createFeedbackEvent = (
  eventId,
  questionEventId,
  answerEventId,
  clientId,
  feedbackPayload
) => ({
  ...buildCommonFields(eventId, clientId),
  type: 'feedback',
  questionEventId,
  answerEventId,
  sentiment: normalizeFeedbackSentiment(feedbackPayload),
  optionalNote: String(feedbackPayload.optionalNote || '').substring(0, 500),
});

/**
 * Returns a recorder API used by request handlers.
 */
function createEventRecorder(env, kv) {
  const repository = createEventLogRepository(kv, getEventTtlSeconds(env));

  return {
    recordQuestion: (eventId, clientId, question, payload) =>
      repository.append(createQuestionEvent(eventId, clientId, question, payload)),
    recordAnswer: (eventId, questionEventId, clientId, answer, citations, latencyMs, backendMode) =>
      repository.append(
        createAnswerEvent(
          eventId,
          questionEventId,
          clientId,
          answer,
          citations,
          latencyMs,
          backendMode
        )
      ),
    recordFeedback: (eventId, questionEventId, answerEventId, clientId, feedbackPayload) =>
      repository.append(
        createFeedbackEvent(eventId, questionEventId, answerEventId, clientId, feedbackPayload)
      ),
  };
}

/**
 * Best-effort question event persistence.
 *
 * Returns the incoming event id for easy chaining in request pipelines.
 */
async function recordQuestionEvent(eventId, clientId, question, payload, env, kv) {
  if (env.EVENT_LOGGING_ENABLED !== 'true') {
    return eventId;
  }

  try {
    await createEventRecorder(env, kv).recordQuestion(eventId, clientId, question, payload);
  } catch (_error) {
    // Fail silently; event recording is non-critical.
  }
  return eventId;
}

/**
 * Best-effort answer event persistence.
 */
async function recordAnswerEvent(
  eventId,
  questionEventId,
  clientId,
  answer,
  citations,
  latencyMs,
  backendMode,
  env,
  kv
) {
  if (env.EVENT_LOGGING_ENABLED !== 'true') {
    return eventId;
  }

  try {
    await createEventRecorder(env, kv).recordAnswer(
      eventId,
      questionEventId,
      clientId,
      answer,
      citations,
      latencyMs,
      backendMode
    );
  } catch (_error) {
    // Fail silently; event recording is non-critical.
  }
  return eventId;
}

export { createEventLogRepository, createEventRecorder, recordQuestionEvent, recordAnswerEvent };
