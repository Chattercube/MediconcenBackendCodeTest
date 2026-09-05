# Remediation plan

This checklist records the improvements completed against [the updated requirements](new_requirements.pdf).

## Correctness and reliability

- [x] Use an unambiguous JSON-encoded Redis key for each identifier pair, assuming previous cache entries have been cleared. Add regression tests for pairs such as `("a:b", "c")` and `("a", "b:c")` to verify independent resolution, cache hits and persistence through cache misses with in-memory dependencies.
- [x] Define and document the existing MySQL identifier equality rules for case, accents and trailing spaces, explain their cache implications, and verify them against the live database.
- [x] Handle Redis read and write failures without preventing resolution through MySQL. Restore cache availability after reconnection and test outage and recovery behavior.
- [x] Verify that database failures produce controlled HTTP responses without exposing internal details.

## Configuration

- [x] Remove hard-coded database password defaults from application code and Docker Compose. Require environment configuration and validate it at startup.
- [x] Keep placeholders in `.env.example` and exclude local credentials from version control.
- [x] Document environment loading and the different hostnames used for local and Docker execution.

## Automated checks

- [x] Add a working test command and initial input-validation coverage.
- [x] Extend coverage to new and existing pairs, cache-key collisions, dependency failures and concurrent requests for the same pair.
- [x] Add the missing ESLint configuration and verify lint and build commands succeed.
- [x] Verify Redis GET/SET, TTL expiry, command timeouts, offline startup and reconnection against a live Redis instance.
- [x] Add a separate HTTP/MySQL/Redis integration suite for persistence, concurrent requests, validation and dependency outages.
- [x] Run integration checks against MySQL 8 and Redis, including persistence across API restarts and duplicate prevention under concurrent requests.
- [x] Verify the documented Docker startup procedure.

## Documentation

- [x] Complete the README with prerequisites, configuration, database setup and test instructions.
- [x] Explain identifier comparison, cache behavior and the unique-constraint/upsert concurrency approach.
- [x] Ensure API examples and the sequence diagram reflect the final implementation.

## Verification status

`npm run check` passes: ESLint reports no issues, all 86 configuration, validation and service tests pass, and the application builds successfully. `npm run test:integration` passes against MySQL 8.4.11 and Redis 7.4.11. It verifies real HTTP requests, persistence across application restart, cache misses, identifier equality, the cache-key collision fix, 24 concurrent requests, invalid input, generic database errors, Redis fallback and recovery. Docker Compose configuration validates, all three services start successfully, health checks pass, and the containerized API passes a persistence/cache smoke check.

All identified remediation items are complete. Regression and integration tests accompany the relevant fixes.
