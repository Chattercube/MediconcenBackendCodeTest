# Mediconcen Backend Code Test

Small NestJS API using TypeScript, MySQL 8, and Redis.

## Quick Brief

NestJS is a structured Node.js framework for TypeScript backends. It borrows ideas from Angular: controllers handle HTTP routes, services hold business logic, and modules group related code. For this project, NestJS gives the backend a clean shape without much ceremony.

Redis is an in-memory data store. Here it is used as a cache: once `(id1, id2)` has been resolved to a `userID`, future requests can return quickly without immediately querying MySQL. MySQL is still the source of truth.

Cache keys use `user-link:` followed by a JSON-encoded identifier pair. For example, `("a:b", "c")` becomes `user-link:["a:b","c"]`, while `("a", "b:c")` becomes `user-link:["a","b:c"]`. JSON encoding preserves the boundary between identifiers and escapes quotes and backslashes. Existing cache entries are assumed to have been cleared before adopting this format.

Redis is optional at runtime: an unavailable connection or failed GET is treated as a cache miss, and a failed SET does not prevent returning the MySQL result. Connections and commands have one-second timeouts. Commands are not queued while offline or replayed after reconnection. The client reconnects in the background, and caching resumes when its status becomes ready. Shutdown disconnects directly so it cannot wait for an offline QUIT command. A stalled GET followed by a stalled SET can add roughly two seconds to a request; MySQL latency is separate.

## Run With Docker

Complete the configuration setup below first, including both MySQL passwords. Docker with the Compose plugin is required.

```bash
docker compose up --build
```

With the example `PORT=3000`, the API will listen on `http://localhost:3000`.

## Configuration Setup

From the project root, copy the configuration template:

```powershell
# PowerShell
Copy-Item .env.example .env
```

```bash
# macOS / Linux
cp .env.example .env
```

Fill in `MYSQL_PASSWORD` with your own password. If using Docker Compose, also fill in `MYSQL_ROOT_PASSWORD` with a separate password for MySQL administration. The blank values in the template are intentional; the application does not supply fallback credentials. For passwords containing `#` or `$`, use a single-quoted value in `.env` so the characters remain literal.

| Variable | Purpose |
| --- | --- |
| `PORT` | API listening port. |
| `MYSQL_HOST`, `MYSQL_PORT` | MySQL address for local application execution. The template uses host port `3307` to avoid a common local `3306` conflict; the containerized API uses MySQL's internal port `3306`. |
| `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | Application database account and database name. |
| `REDIS_HOST`, `REDIS_PORT` | Redis address for local application execution. |
| `REDIS_CACHE_TTL_SECONDS` | Positive integer cache lifetime in seconds. |
| `MYSQL_ROOT_PASSWORD` | Required by Compose to initialize MySQL; not used or passed to the API. |

The application loads `.env` from its working directory. Run the documented commands from the project root. Environment variables already supplied by the shell or deployment platform take precedence over `.env`; a file is optional when all application variables are supplied directly. All application variables listed above are required, ports must be integers from 1 to 65535, and the cache lifetime must be a positive safe integer.

Missing or invalid configuration stops startup with exit code 1 before database or Redis connections are opened. The error lists the affected variable names and directs you to copy and complete `.env.example`; it does not print their values. Compose also rejects missing or empty required values before creating containers.

The template uses `localhost` for running the API on your machine. Compose reads your `.env` values and explicitly uses the internal service names `mysql` and `redis` and their container ports for the containerized API. `MYSQL_PORT` and `REDIS_PORT` in `.env` control their published host ports. You do not need to edit hostnames when switching between the documented local and Docker commands.

Compose initializes the database and application account on the first run with an empty MySQL volume. Changing `.env` passwords later does not update accounts in an existing volume: update those accounts to match before restarting. When using an existing MySQL server instead, create the configured database and application account yourself and grant the account permissions to create the table and read/write its rows. The API creates the `user_links` table on startup.

Local `.env` files are excluded from Git and the Docker build context. Only the configuration template belongs in version control.

## Endpoint

```http
POST /users/resolve
Content-Type: application/json

{
  "id1": "abc",
  "id2": "xyz"
}
```

Response:

```json
{
  "userID": "3dfd64cc-4cf0-465c-b736-4f6b19527019"
}
```

If the `(id1, id2)` pair already exists in MySQL, the existing `userID` is returned. If not, the service generates a UUIDv4, inserts the row, caches the result in Redis, and returns it.

## Database Table

The app creates this table on startup:

```sql
CREATE TABLE IF NOT EXISTS user_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id1 VARCHAR(255) NOT NULL,
  id2 VARCHAR(255) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_links_id1_id2 (id1, id2),
  UNIQUE KEY uq_user_links_user_id (user_id)
);
```

## Sequence Diagram

```mermaid
sequenceDiagram
  participant Client
  participant API as NestJS API
  participant Redis
  participant MySQL

  Client->>API: POST /users/resolve { id1, id2 }
  API->>Redis: GET user-link:JSON.stringify([id1, id2])
  alt Cache hit
    Redis-->>API: userID
    API-->>Client: { userID }
  else Cache miss or Redis unavailable
    API->>MySQL: INSERT id1, id2, UUIDv4 ON DUPLICATE KEY UPDATE
    API->>MySQL: SELECT user_id WHERE id1 = ? AND id2 = ?
    MySQL-->>API: userID
    API->>Redis: SET user-link:JSON.stringify([id1, id2]) userID
    Note over API,Redis: SET failures are logged; return the MySQL result
    API-->>Client: { userID }
  end
```

## Local Development

Complete Configuration Setup first. Use Node.js 22.13 or later in the Node.js 22 line to match the Docker runtime and the lint dependencies.

Install dependencies:

```bash
npm ci
```

Start MySQL and Redis:

```bash
docker compose up mysql redis
```

Run the API:

```bash
npm run start:dev
```

## Development Checks

Use the Node.js version described above and install dependencies with `npm ci` before running checks.

| Command | Purpose |
| --- | --- |
| `npm run lint` | Check application and test TypeScript with ESLint; fail on errors or warnings without modifying files. |
| `npm run lint:fix` | Apply available ESLint fixes, then report any remaining issues. |
| `npm test` | Compile application and test TypeScript, then run the automated tests. |
| `npm run test:redis` | Run the separate live Redis integration check; requires a reachable Redis instance. |
| `npm run test:integration` | Run the HTTP/MySQL/Redis suite and the live Redis checks; requires working development service credentials. |
| `npm run build` | Build the application for deployment. |
| `npm run check` | Run lint, tests and the application build in order; stop on failure. |

### How the tests work

The suite uses Node's built-in `node:test` runner and `node:assert`, with the existing TypeScript compiler. No additional test-runner dependency is required.

`npm test` first removes the generated `.test-dist` directory so deleted tests cannot run from stale output. It compiles the source and tests with `tsconfig.test.json`, preserving the decorator metadata required by NestJS validation. Node then discovers the compiled `*.test.js` files under `.test-dist/test`, reports each result, and exits with a nonzero status if a test fails. TypeScript compilation errors also fail the command before tests run. Test output is ignored by Git and excluded from the application build.

The initial suite in `test/validation.test.ts` exercises the same validation-pipe factory used by application startup. Its 19 cases check valid inputs, length boundaries, missing values, invalid types, empty or oversized identifiers, and unexpected properties. Rejected inputs must produce a 400 exception with a message identifying the invalid field.

The configuration suite in `test/configuration.test.ts` checks required values, numeric ranges, secret-safe errors, `.env` loading and environment-variable precedence. It also launches the compiled application in an isolated directory with no configuration to verify that startup exits with setup guidance. Test passwords are generated at runtime.

The service regression tests in `test/user-links.test.ts` use in-memory database and Redis substitutes to verify that delimiter-containing identifiers, quotes, backslashes and pair ordering resolve independently. They also verify that repeated requests use the cache and retain their IDs after the cache is cleared.

The Redis unit tests in `test/redis.test.ts` cover startup failure, GET/SET errors, disconnection, recovery and shutdown. They exercise the real Redis service with a client substitute and verify user resolution against an in-memory database substitute.

The 84 default tests require no `.env`, HTTP server, MySQL or Redis. Live checks are separate so these fast tests can run without external services.

### Live Redis verification

Run `npm run test:redis` against an unauthenticated development Redis instance. The integration commands load `.env`, or the file named by `INTEGRATION_ENV_FILE`, without overriding shell variables. Redis uses `REDIS_HOST` and `REDIS_PORT`, defaulting to `127.0.0.1:6379`; `REDIS_TEST_HOST` and `REDIS_TEST_PORT` take precedence when supplied. The command fails if Redis is unreachable.

The test uses unique, expiring `codex:redis-test:` keys and deletes its own keys afterward. A temporary local TCP proxy interrupts only the test connections; the Redis server is not stopped or flushed. It verifies GET/SET, TTL expiration, stalled-command timeouts, offline startup, automatic reconnection and suppression of offline writes. The application Redis client and service are used directly.

Verified against Redis 7.4.11: all live checks passed, including recovery of both an established connection and a client started during the outage. This establishes Redis behavior; full API/MySQL integration remains outstanding.

### HTTP, MySQL and Redis integration

`npm run test:integration` runs `integration/api.test.ts` and the Redis suite. Configure `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` and `MYSQL_DATABASE` in `.env` or the shell. Use a development MySQL 8 database whose account can create the application table and select, insert, update and delete test rows. Alternatively, point `INTEGRATION_ENV_FILE` to a separate ignored local configuration file such as `.env.integration`. No fallback database credentials are embedded in the tests.

The suite starts the real NestJS modules and validation pipe on an automatically allocated local HTTP port. It uses real MySQL and Redis connections to check:

- New UUID persistence, repeated requests, cache population and cache misses.
- Persistence after closing and restarting the application and removing its cache entry.
- Separate records for identifier pairs that previously collided in Redis.
- One row and one UUID from 24 concurrent requests for a new pair.
- HTTP 400 responses for invalid request bodies.
- Existing and new user resolution during a Redis outage, followed by cache recovery.
- A generic HTTP 500 during a MySQL connection outage, continued API responsiveness and successful recovery.

The fault-injection proxies affect only test connections. Each run uses random identifier pairs and deletes only its own exact rows and cache keys afterward. The suite does not stop services, flush Redis, truncate tables or drop the database. MySQL must already exist; normal application startup creates `user_links` if needed.

Verified against MySQL 8.4.11 and Redis 7.4.11: all HTTP, persistence, concurrency, validation, outage and recovery checks passed. The containerized API also passed a smoke check confirming HTTP 200 responses, a stable UUID across repeated requests, one matching MySQL row and a matching Redis entry. Integration failures are reported as failures, not skipped or passing tests.

To extend the suite, add `*.test.ts` files under `test/`, import `test` from `node:test`, and use assertions from `node:assert`. Keep regression cases alongside each behavior change. The existing NestJS testing package is available for future tests that need dependency injection or provider overrides.

### Inspecting the database during local development

You can access the MySQL monitor on the machine that runs the sql container by:

`docker exec -it mediconcenbackendcodetest-mysql-1 mysql -u <MYSQL_USER> -p`

... and then enter the password provided in your configuration file

For the specific database, enter this from the interactive environment:

`use <MYSQL_DATABASE>`
