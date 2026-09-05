# Remediation plan

This checklist tracks the remaining improvements identified against [the updated requirements](new_requirements.pdf). All items are pending unless marked complete.

## Correctness and reliability

- [x] Use an unambiguous JSON-encoded Redis key for each identifier pair, assuming previous cache entries have been cleared. Add regression tests for pairs such as `("a:b", "c")` and `("a", "b:c")` to verify independent resolution, cache hits and persistence through cache misses with in-memory dependencies.
- [ ] Define how case, accents and trailing spaces affect identifier equality. Apply consistent behavior in MySQL and Redis, document the decision, and account for existing database tables when changing the schema.
- [x] Handle Redis read and write failures without preventing resolution through MySQL. Restore cache availability after reconnection and test outage and recovery behavior.
- [ ] Verify that database failures produce controlled HTTP responses without exposing internal details.

## Configuration

- [x] Remove hard-coded database password defaults from application code and Docker Compose. Require environment configuration and validate it at startup.
- [x] Keep placeholders in `.env.example` and exclude local credentials from version control.
- [x] Document environment loading and the different hostnames used for local and Docker execution.

## Automated checks

- [x] Add a working test command and initial input-validation coverage.
- [ ] Extend coverage to new and existing pairs, cache-key collisions, dependency failures and concurrent requests for the same pair.
- [x] Add the missing ESLint configuration and verify lint and build commands succeed.
- [x] Verify Redis GET/SET, TTL expiry, command timeouts, offline startup and reconnection against a live Redis instance.
- [x] Add a separate HTTP/MySQL/Redis integration suite for persistence, concurrent requests, validation and dependency outages.
- [x] Run integration checks against MySQL 8 and Redis, including persistence across API restarts and duplicate prevention under concurrent requests.
- [ ] Verify the documented Docker startup procedure.

## Documentation

- [ ] Complete the README with prerequisites, configuration, database setup and test instructions.
- [ ] Explain identifier comparison, cache behavior and the unique-constraint/upsert concurrency approach.
- [ ] Ensure API examples and the sequence diagram reflect the final implementation.

## Verification status

`npm run check` passes: ESLint reports no issues, all 84 configuration, validation and service tests pass, and the application builds successfully. `npm run test:integration` passes against MySQL 8.4.11 and Redis 7.4.11. It verifies real HTTP requests, persistence across application restart, cache misses, the cache-key collision fix, 24 concurrent requests, invalid input, generic database errors, Redis fallback and recovery. The containerized API also passes a persistence/cache smoke check. Full Docker startup verification is recorded separately because the existing MySQL volume had to be recreated with its current port binding while retaining its data.

Update this checklist as changes are implemented, with regression tests accompanying the relevant fixes.
