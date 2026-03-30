/**
 * Event logging barrel exports.
 *
 * Purpose: provide a stable import surface to `src/index.js` and tests so
 * internals can be reorganized without touching every caller.
 */

export { parsePositiveInteger, getRateLimitPolicy, getEventTtlSeconds } from './event-policy.js';

export { generateEventId, hashString, getClientId } from './event-identifiers.js';

export {
  createEventLogRepository,
  createEventRecorder,
  recordQuestionEvent,
  recordAnswerEvent,
} from './event-store.js';

export { checkRateLimit } from './rate-limit.js';
