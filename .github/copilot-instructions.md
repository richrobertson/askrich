# Copilot Instructions for PR Remediation Automation

When the user asks to process a pull request, follow this deterministic workflow end-to-end until the PR is clean.

## Scope

Use this workflow for current and future PRs in this repository when requested.

## Required loop

Repeat the following steps until both conditions are true:
- no failing checks
- no unresolved review threads

## Step 1: Pull PR state and unresolved review threads

Use GitHub GraphQL via gh api to fetch:
- PR id, head ref name, head sha
- unresolved review threads
- thread ids
- comment ids, comment authors, comment bodies

Preferred query shape:
- repository -> pullRequest(number) -> reviewThreads(first: 100)
- filter unresolved threads where isResolved is false

## Step 2: Pull check failures

Collect failing CI signals for the PR head sha:
- failing check runs
- failing required status contexts

Use gh api or gh pr checks for machine-readable output.

## Step 3: Apply code fixes for all actionable findings

For each unresolved thread and each failing check:
- inspect files and reproduce failing condition
- implement minimal, correct code changes
- run relevant local validation (tests, lint, smoke checks)
- keep changes scoped to the PR ask

## Step 4: Commit and push fixes

After fixes pass local validation:
- git add affected files
- commit with clear remediation message
- push to PR branch

## Step 5: Reply to each unresolved review thread comment

For each unresolved thread:
- post a reply comment describing the exact fix and file locations
- include any follow-up notes if partially addressed

Use GraphQL or REST to post replies on review comment threads.

## Step 6: Resolve all addressed review threads

After posting replies and pushing fixes:
- resolve each addressed thread using GraphQL mutation resolveReviewThread

Do not leave addressed threads unresolved.

## Step 7: Request a fresh Copilot review

Request another Copilot pass via GitHub API workflow.

Preferred method:
- post a PR comment through GraphQL using addComment with body: "@copilot review"

If repository supports explicit reviewer request for Copilot bot via API, use that path as well.

## Step 8: Poll for new feedback and failures

Poll every 60-120 seconds for:
- newly opened unresolved review threads
- newly failing checks

If new issues appear, repeat from Step 1.

## Completion criteria

Only stop when:
- all checks are passing
- unresolved review thread count is zero
- fresh Copilot review has been requested after latest push

## Reporting format to user

Each cycle, report:
- number of unresolved threads before and after
- failing checks before and after
- commits pushed
- comments replied and threads resolved
- timestamp and result of Copilot re-review request

## Safety and quality constraints

- Never force push unless explicitly requested.
- Never resolve a thread without posting a substantive reply.
- Never claim a check is fixed without rerunning validation.
- Preserve unrelated user changes.
