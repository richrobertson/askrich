# Behavioral Interview Response Quality Test Plan

## Goal

Evaluate chat response quality for software-engineer behavioral interview prompts using a public-source question set and a repeatable scoring process.

This plan is designed to:
- ask chat a large behavioral question set,
- capture answers/citations/latency,
- inspect quality with both rubric scoring and objective checks,
- identify failure modes and regression risk.

## Public-source research basis

Question set source file: `docs/evals/behavioral_question_bank_public.json`

Total questions: 63 (minimum requirement met: >= 50)

Public websites used:
- https://www.themuse.com/advice/behavioral-interview-questions-answers-examples
- https://www.indeed.com/career-advice/interviewing/behavioral-interview-questions
- https://www.coursera.org/articles/behavioral-interview-questions
- https://www.simplilearn.com/behavioral-interview-questions-article

Notes:
- Each question in the bank includes a `source_url` field for traceability.
- Questions are paraphrased and internally authored from public interview themes.
- Questions are software-engineer relevant in competency scope: ownership, communication, conflict, execution, decision-making, leadership, adaptability.

## Test assets

- Question bank: `docs/evals/behavioral_question_bank_public.json`
- Runner: `scripts/run_eval_bank.py`
- Run artifact output directory: `data/evals/`

## Execution procedure (ask the chat)

1. Start the API service locally.
2. Run the behavioral eval bank:

```bash
python scripts/run_eval_bank.py \
  --api-base http://127.0.0.1:8000 \
  --question-bank docs/evals/behavioral_question_bank_public.json
```

3. Collect output artifacts (created automatically):
- `data/evals/eval_run_<timestamp>.json`
- `data/evals/eval_rubric_<timestamp>.csv`

## Quality inspection procedure

### A. Manual rubric scoring (primary)

Use the generated CSV and score each response from 1-5 for:
- correctness,
- relevance,
- recruiter usefulness,
- citation quality,
- conciseness.

### B. Objective checks (secondary)

Inspect each response for:
- chat-fit length: default behavioral response should be compact and readable in a chat pane,
- structure quality: for "tell me about a time" prompts, response should clearly communicate S/T, A, and R,
- evidence grounding: claims should align with known profile/projects corpus,
- style quality: direct, first-person, no generic filler,
- safety/privacy: no private contact detail disclosure.

## Pass/fail gates

Run passes when all are true:
- request success rate >= 99% (transport + API),
- average rubric score >= 4.0 for each dimension,
- no more than 3 responses with overall score < 3,
- zero severe hallucinations (materially false career claims),
- zero privacy violations.

If any gate fails, log failing IDs and remediate before re-running.

## Failure taxonomy

Tag each failed response with one or more:
- hallucinated_fact,
- weak_relevance,
- low_signal_generic,
- missing_or_weak_citation,
- too_long_for_chat,
- weak_star_structure,
- style_not_first_person,
- privacy_policy_issue.

## Remediation loop

1. Group failures by pattern.
2. Fix retrieval or response construction logic.
3. Re-run full bank.
4. Re-score only changed or previously failing items first.
5. Run a regression subset of high-risk prompts before signoff.

## Recommended regression subset (fast check)

Use these IDs as a quick quality gate after each behavioral-response change:
- `behavioral_conflict_coworker`
- `behavioral_persuade_work`
- `behavioral_pressure`
- `behavioral_fail_deal`
- `indeed_mistake_learn`
- `indeed_untrained_task`
- `coursera_miscommunication_error`
- `coursera_disagree_manager`
- `coursera_under_pressure`
- `coursera_identify_problem_solution`

## Reporting template

For each run, report:
- run timestamp,
- total/success/failure counts,
- average latency,
- average rubric scores per dimension,
- count of failures by taxonomy,
- top 5 weakest responses with IDs and notes,
- remediation actions and re-run delta.
