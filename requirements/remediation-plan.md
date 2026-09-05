# Remediation plan

This checklist tracks the remaining improvements identified against [the updated requirements](new_requirements.pdf). All items are pending unless marked complete.

## Correctness and reliability

- [ ] Use an unambiguous, versioned Redis key for each identifier pair. Add a regression test for pairs such as `("a:b", "c")` and `("a", "b:c")` to verify that each receives its own persisted user ID.
- [ ] Define how case, accents and trailing spaces affect identifier equality. Apply consistent behavior in MySQL and Redis, document the decision, and account for existing database tables when changing the schema.
- [ ] Handle Redis read and write failures without preventing resolution through MySQL. Restore cache availability after reconnection and test outage and recovery behavior.
- [ ] Verify that database failures produce controlled HTTP responses without exposing internal details.

## Configuration

- [x] Remove hard-coded database password defaults from application code and Docker Compose. Require environment configuration and validate it at startup.
- [x] Keep placeholders in `.env.example` and exclude local credentials from version control.
- [x] Document environment loading and the different hostnames used for local and Docker execution.

## Automated checks

- [x] Add a working test command and initial input-validation coverage.
- [ ] Extend coverage to new and existing pairs, cache-key collisions, dependency failures and concurrent requests for the same pair.
- [x] Add the missing ESLint configuration and verify lint and build commands succeed.
- [ ] Run integration checks against MySQL 8 and Redis, including persistence across API restarts and duplicate prevention under concurrent requests.
- [ ] Verify the documented Docker startup procedure.

## Documentation

- [ ] Complete the README with prerequisites, configuration, database setup and test instructions.
- [ ] Explain identifier comparison, cache behavior and the unique-constraint/upsert concurrency approach.
- [ ] Ensure API examples and the sequence diagram reflect the final implementation.

## Verification status

`npm run check` passes: ESLint reports no issues, all 76 configuration and validation tests pass, and the application builds successfully. The suite verifies configuration loading, required values, startup failure guidance and the shared application validation pipe without external services. Earlier review checks using mocked dependencies reproduced a cache-key collision and a request failure after a simulated Redis write error; these fixes remain pending. Live MySQL, Redis and Docker verification is outstanding.

Update this checklist as changes are implemented, with regression tests accompanying the relevant fixes.
