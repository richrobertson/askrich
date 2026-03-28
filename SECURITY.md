# Security Policy

## Reporting vulnerabilities

Please report security vulnerabilities privately to the project maintainer.
Do not open public issues for sensitive findings.

## Secret handling requirements

- Never commit secrets, tokens, or private keys.
- Cloud credentials must never be committed to the repository.
- Production prompt/config secrets must be provided through environment variables.
- Model provider credentials must never be committed.

## Credential hygiene

- Rotate exposed credentials immediately.
- Use scoped, least-privilege tokens where possible.
- Prefer separate credentials per environment (dev/staging/prod).
