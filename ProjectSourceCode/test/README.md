# Bloom — Lab 10 tests

## Setup

Work in `ProjectSourceCode/`.

Install test dependencies into the test container's own `node_modules` volume:

```
docker compose -p lab10-tests -f docker-compose.test.yaml run --rm --no-deps tests npm ci
```

Run the full suite (unit + API integration) against the isolated test database:

```
docker compose -p lab10-tests -f docker-compose.test.yaml up --abort-on-container-exit --exit-code-from tests
```

Stop the test containers, keeping the volumes:

```
docker compose -p lab10-tests -f docker-compose.test.yaml down
```

Reset the test database and test dependencies (deletes all `lab10-tests` volumes):

```
docker compose -p lab10-tests -f docker-compose.test.yaml down --volumes
```

After a reset, rerun the `npm ci` command, then the `up` command.

`npm test` on the host runs the unit tests only. The API integration tests need the test database, which only exists inside the Docker test stack — do not run them against a development or deployed database.

## Route contract — POST /register

- Endpoint: `POST /register`
- Request: HTML form, `username` and `password` fields (`Content-Type: application/x-www-form-urlencoded`).
- Validation (`src/validateRegistration.js`, used by the route before hashing or inserting):
  - Username must be a non-empty string after trimming, at most 50 characters.
  - Password must be 8–72 characters.
- Success: `302` redirect to `/login`. Exactly one row is created in `users`, with `password` stored as a bcrypt hash (bcryptjs, 10 rounds), never plaintext.
- Missing password (or missing username): `400`, renders `pages/register` with an error message, and no matching row is created.
- Duplicate username: `400`, renders `pages/register` with "That username is already taken."

## GET /welcome

- Endpoint: `GET /welcome`
- Response: `200`, JSON `{ "status": "success", "message": "Welcome!" }`.
- Public route — no login required.

## Test database and cleanup

- Test database: `project_test`, user `lab10_test`, host `db-test`, Postgres 16 (matches the development database major version). Configuration is in `.env.test` (local only, gitignored); `.env.test.example` is committed with the same placeholders.
- `src/db.js` is the shared database module for routes and tests. It throws if `NODE_ENV=test` and the database name does not end in `_test`, so tests cannot point at a development database.
- Each registration test uses a unique username, `lab10_<random UUID>`, so runs never collide with real users or previous runs.
- Cleanup deletes only the user that test created (`DELETE FROM users WHERE username = $1`). Tests never truncate the `users` table.

## Files

- `test/validation.spec.js` — unit tests for `validateRegistration`, no HTTP, no database.
- `test/server.spec.js` — API integration tests: welcome route, positive and negative `POST /register`, with database assertions and cleanup. Closes the database pool in an `after()` hook.
- `docker-compose.test.yaml` — isolated `db-test` (Postgres 16) and `tests` (Node 22) services. The `db-test` healthcheck makes the tests wait until Postgres accepts connections.
