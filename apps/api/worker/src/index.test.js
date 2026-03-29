/**
 * Unit Tests for Ask Rich Worker Chat Functions
 *
 * OVERVIEW:
 *   This test suite validates canned response quality for local chat mode.
 *   Tests ensure answers are focused, concise, and appropriately routed.
 *
 * TEST COVERAGE (40+ assertions across 9 describe blocks):
 *   1. Question Intent Detection
 *      - Oracle CNS outcomes detection
 *      - Profile/contact query detection
 *      - Education/technology query detection
 *      - Behavioral question detection
 *
 *   2. Answer Quality by Question Type
 *      - Oracle CNS outcomes: Returns measurable metrics
 *      - Profile queries: Returns only profile links
 *      - Education queries: Returns degree info
 *      - Technology queries: Returns tech stack
 *
 *   3. Quality Constraints
 *      - Answer length limits (600-800 chars max)
 *      - No unrelated content mixing
 *      - Minimal bullet point count (≤2)
 *      - No profile links in non-profile answers
 *
 *   4. STAR Format Answers
 *      - Situation, Task, Action, Result components
 *      - Optional reflection section
 *      - Chat-mode compact format
 *
 *   5. Corpus Ranking
 *      - Relevant documents ranked higher
 *      - Question-specific ranking (Oracle docs for Oracle questions)
 *
 *   6. End-to-end Integration
 *      - Oracle outcomes flow
 *      - Profile query flow
 *      - Education query flow
 *      - Technology query flow
 *
 * RUNNING TESTS:
 *   npm install vitest
 *   npm test
 *
 * RELATED DOCUMENTATION:
 *   - docs/testing/CANNED_RESPONSES.md: Complete testing guide with examples
 *   - scripts/test_canned_responses.py: Python test specification validator
 *   - scripts/test_canned_responses_integration.py: Live worker response validator
 *   - src/index.js: Implementation (see buildAnswer, buildProfileResponse, etc.)
 *
 * QUALITY EXPECTATIONS:
 *   ✓ Oracle outcomes: Returns "$2M", "scalability", "operational readiness"
 *   ✓ Profile queries: Return specific links only (no project details)
 *   ✓ Education: Return Purdue degree (no unrelated content)
 *   ✓ Sensitive contact: Refuse PII, redirect to LinkedIn
 *   ✓ All answers: Stay concise (<600-800 chars)
 */

import { describe, it, expect } from 'vitest';
import {
  CORPUS,
  buildAnswer,
  buildBehavioralAnswer,
  buildProfileResponse,
  isBehavioralQuestion,
  isOracleCnsOutcomesQuestion,
  isTechnologyPassionQuestion,
  isShortFactualQuestion,
  isProfileLinksQuery,
  isContactQuery,
  isSensitiveContactQuery,
  isAllProfilesQuery,
  buildSmallTalkResponse,
  isGreetingQuery,
  isHowAreYouQuery,
  isThanksQuery,
  isWhoAreYouQuery,
  rankCorpus,
  clipSentence,
  formatStarAnswer,
} from '../src/index.js';

describe('Canned Response Quality Tests', () => {
  describe('Question Intent Detection', () => {
    it('should detect greeting and small-talk queries', () => {
      expect(isGreetingQuery('hello')).toBe(true);
      expect(isGreetingQuery('good morning')).toBe(true);
      expect(isGreetingQuery('tell me about oracle')).toBe(false);

      expect(isHowAreYouQuery('how are you')).toBe(true);
      expect(isHowAreYouQuery('how are you doing')).toBe(true);
      expect(isHowAreYouQuery('how did you do the migration')).toBe(false);

      expect(isThanksQuery('thanks')).toBe(true);
      expect(isThanksQuery('thank you')).toBe(true);
      expect(isThanksQuery('show me tech stack')).toBe(false);

      expect(isWhoAreYouQuery('who are you')).toBe(true);
      expect(isWhoAreYouQuery('what can you do')).toBe(true);
      expect(isWhoAreYouQuery('what did you do at oracle')).toBe(false);
    });

    it('should detect Oracle CNS outcomes questions', () => {
      expect(isOracleCnsOutcomesQuestion('what measurable outcomes from oracle cns')).toBe(true);
      expect(isOracleCnsOutcomesQuestion('what results did you achieve with oracle')).toBe(true);
      expect(isOracleCnsOutcomesQuestion('how did the notification service project perform')).toBe(
        true
      );
      expect(isOracleCnsOutcomesQuestion('what is your education')).toBe(false);
    });

    it('should detect profile link queries', () => {
      expect(isProfileLinksQuery('what is your github')).toBe(true);
      expect(isProfileLinksQuery('can you share your linkedin')).toBe(true);
      expect(isProfileLinksQuery('profile links')).toBe(true);
      expect(isProfileLinksQuery('tell me about technologies')).toBe(false);
    });

    it('should detect contact queries', () => {
      expect(isContactQuery('how can i reach you')).toBe(true);
      expect(isContactQuery('best way to contact')).toBe(true);
      expect(isContactQuery('get in touch')).toBe(true);
      expect(isContactQuery('what is your background')).toBe(false);
    });

    it('should detect sensitive contact queries', () => {
      expect(isSensitiveContactQuery('what is your phone number')).toBe(true);
      expect(isSensitiveContactQuery('can you share your email')).toBe(true);
      expect(isSensitiveContactQuery('give me your home address')).toBe(true);
      expect(isSensitiveContactQuery('how can i contact you')).toBe(false);
    });

    it('should detect all profiles queries', () => {
      expect(isAllProfilesQuery('all social profiles')).toBe(true);
      expect(isAllProfilesQuery('all profile links')).toBe(true);
      expect(isAllProfilesQuery('public profiles')).toBe(true);
      expect(isAllProfilesQuery('linkedin only')).toBe(false);
    });

    it('should detect behavioral questions', () => {
      expect(isBehavioralQuestion('tell me about a time you had to convince stakeholders')).toBe(
        true
      );
      expect(isBehavioralQuestion('give me an example of a challenge you faced')).toBe(true);
      expect(isBehavioralQuestion('describe when you had to deal with conflict')).toBe(true);
      expect(isBehavioralQuestion('what technologies do you use')).toBe(false);
    });

    it('should detect technology passion questions', () => {
      expect(isTechnologyPassionQuestion('tell me about technologies')).toBe(true);
      expect(isTechnologyPassionQuestion('describe your tech expertise and passion')).toBe(true);
      expect(isTechnologyPassionQuestion('what technologies and tools do you use')).toBe(true);
      expect(isTechnologyPassionQuestion('how do you approach technology')).toBe(true);
      expect(isTechnologyPassionQuestion('technologies you used in the oracle project')).toBe(false);
      expect(isTechnologyPassionQuestion('what is your education')).toBe(false);
      expect(isTechnologyPassionQuestion('Oracle CNS outcomes')).toBe(false);
    });

    it('should detect short factual questions', () => {
      expect(isShortFactualQuestion('where did you go to school')).toBe(true);
      expect(isShortFactualQuestion('what is your educational background')).toBe(true);
      expect(isShortFactualQuestion('what is your tech stack')).toBe(true);
      expect(isShortFactualQuestion('did rich do an internship')).toBe(true);
      expect(isShortFactualQuestion('tell me about a time you had to convince stakeholders')).toBe(false);
      expect(isShortFactualQuestion('how did you lead the oracle migration')).toBe(false);
    });
  });

  describe('Oracle CNS Outcomes Answer Quality', () => {
    it('should return focused outcomes when asked about Oracle CNS results', () => {
      const mockDocs = CORPUS.filter((doc) => doc.id === 'project-oracle-cns');
      const answer = buildAnswer('what measurable outcomes from oracle cns migration', mockDocs);

      expect(answer).toContain('measurable outcomes');
      expect(answer).toContain('$2M enterprise deal timeline');
      expect(answer).toContain('scalability');
      expect(answer).toContain('operational readiness');
      expect(answer).not.toContain('GitHub');
      expect(answer).not.toContain('LinkedIn');
    });

    it('should keep outcomes answer concise', () => {
      const mockDocs = CORPUS.filter((doc) => doc.id === 'project-oracle-cns');
      const answer = buildAnswer('what measurable outcomes from oracle cns migration', mockDocs);

      const lines = answer.split('\n').filter((line) => line.trim());
      expect(lines.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Technology Passion Answer Quality', () => {
    it('should return technology expertise when asked about technologies', () => {
      const mockDocs = CORPUS.slice(0, 3);
      const answer = buildAnswer('tell me about technologies', mockDocs);

      expect(answer).toContain('technology');
      expect(answer).toContain('cloud');
      expect(answer).toContain('Kubernetes');
      expect(answer).not.toContain('GitHub');
      expect(answer).not.toContain('LinkedIn');
      expect(answer).not.toContain('profile');
    });

    it('should return tech expertise for detailed technology questions', () => {
      const mockDocs = CORPUS.slice(0, 3);
      const answer = buildAnswer('describe your tech expertise and passion', mockDocs);

      expect(answer).toContain('technology');
      expect(answer).toContain('backend');
      expect(answer).toContain('distributed systems');
      expect(answer).not.toContain('contact point');
    });

    it('should keep technology answer well-structured', () => {
      const mockDocs = CORPUS.slice(0, 3);
      const answer = buildAnswer('what technologies and tools do you use', mockDocs);

      const lines = answer.split('\n').filter((line) => line.trim());
      expect(lines.length).toBeGreaterThan(3);
      expect(lines.length).toBeLessThanOrEqual(8);
      expect(answer.length).toBeLessThan(900);
    });

    it('should exclude project-specific technology questions from passion detection', () => {
      // "What technologies in the Oracle project" should NOT trigger technology passion answer
      const mockDocs = CORPUS.filter((doc) => doc.id === 'project-oracle-cns');
      const answer = buildAnswer('technologies you used in the oracle project', mockDocs);

      // Should fall back to generic answer (not the technology passion answer)
      // This test ensures we don't return the dedicated technology passion answer
      expect(answer).not.toContain('Rich has broad technology expertise');
    });
  });

  describe('Profile Query Routing', () => {
    it('should return profile links and not other content', () => {
      const mockDocs = CORPUS.slice(0, 3);
      const answer = buildAnswer('what is your github', mockDocs);

      expect(answer).toContain('github');
      expect(answer).not.toContain('Oracle');
      expect(answer).not.toContain('Kubernetes');
    });

    it('should handle specific profile requests correctly', () => {
      const result = buildProfileResponse({
        requestedProfiles: ['github'],
        asksForAllProfiles: false,
        isContactRequest: false,
        isSensitiveContactRequest: false,
        isGenericProfileRequest: false,
      });

      expect(result).toContain('GitHub');
      expect(result).toContain('https://github.com/richrobertson');
      expect(result).not.toContain('Facebook');
    });

    it('should return all profiles when requested', () => {
      const result = buildProfileResponse({
        requestedProfiles: [],
        asksForAllProfiles: true,
        isContactRequest: false,
        isSensitiveContactRequest: false,
        isGenericProfileRequest: false,
      });

      expect(result).toContain('LinkedIn');
      expect(result).toContain('GitHub');
      expect(result).toContain('Facebook');
    });
  });

  describe('Small Talk Responses', () => {
    it('should return a friendly response for greetings', () => {
      const response = buildSmallTalkResponse('Hello');

      expect(response).toContain('Hi there');
      expect(response).toContain('Great to chat');
    });

    it('should handle short greetings that are less than three characters', () => {
      const response = buildSmallTalkResponse('hi');
      expect(response).not.toBeNull();
    });

    it('should return null for non-small-talk questions', () => {
      const response = buildSmallTalkResponse('what technologies did you use at oracle');
      expect(response).toBeNull();
    });
  });

  describe('Sensitive Contact Handling', () => {
    it('should refuse private contact details', () => {
      const result = buildProfileResponse({
        requestedProfiles: [],
        asksForAllProfiles: false,
        isContactRequest: false,
        isSensitiveContactRequest: true,
        isGenericProfileRequest: false,
      });

      expect(result).toContain('do not share private contact details');
      expect(result).toContain('LinkedIn');
      expect(result).not.toContain('phone');
      expect(result).not.toContain('email');
    });
  });

  describe('Answer Quality Constraints', () => {
    it('should keep fallback answers reasonably short', () => {
      const mockDocs = CORPUS.slice(0, 2);
      const answer = buildAnswer('some random question about projects', mockDocs);

      expect(answer.length).toBeLessThan(800);
    });

    it('should not inject profile links into non-profile queries', () => {
      const mockDocs = CORPUS.filter((doc) => doc.id.includes('project'));
      const answer = buildAnswer('what projects has rich worked on', mockDocs);

      // Should not mention GitHub/LinkedIn hosts in body (ignore LinkedIn contact-line context)
      const lines = answer.split('\n');
      const extractHosts = (line) => {
        const matches = line.match(/https?:\/\/[^\s)]+/g) || [];
        return matches
          .map((value) => {
            try {
              return new URL(value).hostname.toLowerCase();
            } catch (_error) {
              return '';
            }
          })
          .filter(Boolean);
      };
      const profileLines = lines.filter((line) => {
        const hosts = extractHosts(line);
        const hasGitHubHost = hosts.some((host) => host === 'github.com' || host === 'www.github.com');
        const hasLinkedInHost = hosts.some(
          (host) => host === 'linkedin.com' || host === 'www.linkedin.com'
        );
        return hasGitHubHost || (hasLinkedInHost && !line.includes('primary contact'));
      });
      expect(profileLines.length).toBeLessThanOrEqual(1);
    });

    it('should clip bullets to reasonable length', () => {
      const longText =
        'This is a very long text that goes on and on with lots of details about something ' +
        'that might not be relevant to the question at hand and should be trimmed down';
      const clipped = clipSentence(longText, 80);

      expect(clipped.length).toBeLessThanOrEqual(83); // 80 + "..."
      expect(clipped).toMatch(/\.\.\.$/);
    });

    it('should not exceed maximum bullet point count', () => {
      const mockDocs = CORPUS.slice(0, 5);
      const answer = buildAnswer('random question', mockDocs);

      const bulletPoints = answer.split('\n').filter((line) => line.trim().startsWith('-'));
      expect(bulletPoints.length).toBeLessThanOrEqual(2);
    });
  });

  describe('STAR Answer Format Quality', () => {
    it('should format STAR answers with all required components', () => {
      const result = formatStarAnswer({
        situation: 'Test situation',
        task: 'Test task',
        action: 'Test action',
        result: 'Test result',
        reflection: 'Test reflection',
        includeReflection: true,
        chatMode: false,
      });

      expect(result).toContain('Situation:');
      expect(result).toContain('Task:');
      expect(result).toContain('Action:');
      expect(result).toContain('Result:');
      expect(result).toContain('Reflection:');
    });

    it('should omit reflection when not included', () => {
      const result = formatStarAnswer({
        situation: 'Test situation',
        task: 'Test task',
        action: 'Test action',
        result: 'Test result',
        reflection: 'Test reflection',
        includeReflection: false,
        chatMode: false,
      });

      expect(result).not.toContain('Reflection:');
    });

    it('should use chat-mode compact format when requested', () => {
      const result = formatStarAnswer({
        situation: 'Test situation',
        task: 'Test task',
        action: 'Test action',
        result: 'Test result',
        reflection: null,
        includeReflection: false,
        chatMode: true,
      });

      expect(result).toContain('S/T:');
      expect(result).toContain('A:');
      expect(result).toContain('R:');
      expect(result).not.toContain('Situation:');
    });
  });

  describe('Behavioral Answer Quality', () => {
    it('should produce a focused behavioral answer', () => {
      const mockDocs = CORPUS.filter((doc) => doc.id.includes('oracle') || doc.id.includes('java17'));
      const answer = buildBehavioralAnswer('tell me about a time you had to convince stakeholders', mockDocs);

      expect(answer).toBeTruthy();
      expect(answer.length).toBeGreaterThan(50);
      expect(answer.length).toBeLessThan(1000);
    });
  });

  describe('Corpus Ranking Quality', () => {
    it('should rank relevant documents higher', () => {
      const ranked = rankCorpus('what projects have you led at oracle');

      expect(ranked.length).toBeGreaterThan(0);
      const topDoc = ranked[0];
      expect(topDoc.score).toBeGreaterThan(0);

      // Oracle-related docs should be in top results
      const oracleIds = ranked.slice(0, 3).map((doc) => doc.id);
      const hasOracleDoc = oracleIds.some((id) => id.includes('oracle') || id.includes('java17'));
      expect(hasOracleDoc).toBe(true);
    });

    it('should rank education docs for education questions', () => {
      const ranked = rankCorpus('what degrees do you have');

      const educationDocs = ranked
        .slice(0, 3)
        .filter((doc) => doc.id.includes('education') || doc.id.includes('academic'));
      expect(educationDocs.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: End-to-End Answer Quality', () => {
    it('should deliver focused answer for Oracle outcomes question', () => {
      const question = 'what measurable outcomes did you deliver in the oracle migration';
      const ranked = rankCorpus(question);
      const answer = buildAnswer(question, ranked);

      // Should be specific outcomes, not generic intro
      expect(answer).toContain('measurable outcomes');
      expect(answer).toContain('$2M');
      expect(answer).not.toContain('strongest evidence');
    });

    it('should deliver profile answer for profile question', () => {
      const question = 'what is your linkedin';
      const mockDocs = CORPUS.slice(0, 2);
      const answer = buildAnswer(question, mockDocs);

      expect(answer).toContain('LinkedIn');
      expect(answer).toContain('linkedin.com');
      expect(answer).not.toContain('Kubernetes');
    });

    it('should deliver education answer for education question', () => {
      const question = 'what is your educational background';
      const ranked = rankCorpus(question);
      const answer = buildAnswer(question, ranked);

      expect(answer).toContain('Purdue');
      expect(answer).toContain('bachelor');
      expect(answer).toContain('2007');
      expect(answer).not.toContain('LinkedIn');
    });

    it('should treat school questions as education queries', () => {
      const question = 'where did you go to school?';
      const ranked = rankCorpus(question);
      const answer = buildAnswer(question, ranked);

      expect(answer).toContain('Purdue');
      expect(answer).toContain('bachelor');
      expect(answer).not.toContain('strongest evidence');
    });

    it('should keep school questions concise without retrieval bullets', () => {
      const question = 'where did you go to school?';
      const ranked = rankCorpus(question);
      const answer = buildAnswer(question, ranked);

      expect(answer).toContain('Purdue University');
      expect(answer).not.toContain('\n- ');
      expect(answer.length).toBeLessThan(260);
    });

    it('should return a direct internship answer without unrelated bullets', () => {
      const question = 'did rich do an internship?';
      const ranked = rankCorpus(question);
      const answer = buildAnswer(question, ranked);

      expect(answer).toContain('Yes.');
      expect(answer).toContain('SFI');
      expect(answer).toContain('Interns for Indiana');
      expect(answer).not.toContain('\n- ');
    });

    it('should deliver tech-stack answer for technology question', () => {
      const question = 'what is your tech stack';
      const ranked = rankCorpus(question);
      const answer = buildAnswer(question, ranked);

      expect(answer.toLowerCase()).toMatch(/technology|tech|stack|java|kubernetes/);
      expect(answer).not.toContain('LinkedIn');
    });
  });
});
