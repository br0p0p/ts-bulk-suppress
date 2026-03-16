# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

ts-bulk-suppress is a CLI tool that wraps the TypeScript compiler to help teams adopt stricter TS settings incrementally. It runs `tsc`, categorizes errors (project/external/config), and suppresses known errors via a `.ts-bulk-suppressions.json` config file using either regex path patterns or AST scope-based identifiers (scopeIds).

## Commands

```bash
pnpm install          # Install dependencies (use pnpm, not npm)
pnpm build            # Compile TS → dist/ (rm -rf dist && tsc)
pnpm test             # Run Jest tests
pnpm test -- tests/index.test.ts        # Run a single test file
pnpm test -- -t "deduplicateSuppressors" # Run tests matching a name
pnpm lint             # ESLint
pnpm lint:error       # ESLint (errors only, no warnings)
pnpm prettier         # Format all files
```

## Architecture

**Entry point:** `bin/index.js` → `dist/index.js` (compiled from `src/index.ts`)

Three source files:
- `src/index.ts` — CLI definition (Commander.js) and `main()` orchestration: parse config → create TS program → get diagnostics → categorize → suppress or generate suppressors → report
- `src/tsc-bulk.ts` — All core logic: scopeId generation via AST walk (`findDiagnosticsScopeId`), suppression matching (`isSuppressed`), error categorization (`categorizeDiagnostics`), config parsing with AJV schema validation
- `src/types.ts` — Type definitions; `DiagnosticTsc` extends TS diagnostics with `errorType` and `relativeFilepath`

**Key algorithm — scopeId generation** (`findDiagnosticsScopeId`): Walks the AST from root toward the error position, collecting identifier names from enclosing scope nodes (functions, classes, methods, etc.). Returns a dot-prefixed path like `.myClass.myMethod`. The `isAllowedNamedBlock` function controls which node kinds count as scope boundaries — in strict mode, all nodes contribute.

**Two suppression mechanisms:**
1. **Pattern suppressors** — regex on file path + error codes (or `suppressAll`)
2. **Bulk suppressors** — exact match on filename + scopeId + error code

## Tests

- `tests/index.test.ts` — CLI integration tests (runs the tool against fixture projects) + `deduplicateSuppressors` unit tests
- `tests/diagnostics.test.ts` — scopeId generation tests, error categorization, `isAllowedNamedBlock` coverage
- Fixtures in `tests/fixtures/` — `node/` is the primary fixture with intentional TS errors

## Code Style

- Prettier: 110 char width, single quotes, no trailing commas
- Pre-commit hooks via Husky run lint-staged (prettier + eslint --fix)
- Target: ES2019 CommonJS, TypeScript 5.3.3
