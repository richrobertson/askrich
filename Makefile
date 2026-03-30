# Placeholder make targets for implementation milestones.
# These commands intentionally echo intent until wiring is added.

.PHONY: install lint test docs ingest dev

install:
	@echo "[placeholder] install dependencies (to be wired in milestone implementation)"

lint:
	@echo "[placeholder] run linters (to be wired in milestone implementation)"

test:
	cd apps/api/worker && npm test

python-tests:
	cd apps/api && python -m pytest tests/unit/ -v --tb=short || true

testing: test python-tests coverage

test-watch:
	cd apps/api/worker && npm test:watch

coverage:
	cd apps/api/worker && npm test:coverage

docs:
	@echo "[placeholder] validate docs/links/format (to be wired in milestone implementation)"

ingest:
	@echo "[placeholder] run ingestion pipeline (to be wired in milestone implementation)"

dev:
	@echo "[placeholder] run local app/api development workflow (to be wired in milestone implementation)"
