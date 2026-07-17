# QueueCTL (MERN Edition)

A persistent, multi-process background job queue system — with atomic job claiming, exponential-backoff retries, graceful shutdown, and a Dead Letter Queue — built on the MERN stack (MongoDB, Express, React, Node.js). All queue behavior is implemented from scratch on Node's `child_process`/cluster primitives and Mongoose, with no external queue framework (no Bull, BullMQ, Agenda, or Bee-Queue).

## Table of Contents

- [Project Overview](#project-overview)
- [Feature List](#feature-list)
- [Technology Stack](#technology-stack)
- [Folder Structure](#folder-structure)
- [Setup Instructions](#setup-instructions)
- [Configuration Reference](#configuration-reference)
- [Job Schema](#job-schema)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Architecture Overview](#architecture-overview)
- [Retry Semantics](#retry-semantics)
- [Exponential-Backoff Formula](#exponential-backoff-formula)
- [Atomic-Locking Strategy](#atomic-locking-strategy)
- [Worker Lifecycle](#worker-lifecycle)
- [Graceful Shutdown](#graceful-shutdown)
- [Dead Letter Queue](#dead-letter-queue)
- [Persistence Strategy](#persistence-strategy)
- [Authentication & Security Model](#authentication--security-model)
- [Cross-Platform Support](#cross-platform-support)
- [Logging](#logging)
- [Assumptions and Trade-Offs](#assumptions-and-trade-offs)
- [Testing Instructions](#testing-instructions)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)
- [Future Improvements](#future-improvements)
- [Repository Link](#repository-link)
- [License](#license)

## Project Overview

QueueCTL is a full-stack background job queue system with a web dashboard. It enqueues background jobs via a REST API or the dashboard UI, executes them across multiple Node.js worker processes, prevents duplicate processing via atomic document claiming in MongoDB, retries failed jobs with exponential backoff, moves permanently-failed jobs to a Dead Letter Queue, persists everything across restarts, and lets you manage workers and configuration entirely through the dashboard or API. Authenticated users can log in, view live queue metrics, inspect job attempt history, and manage the DLQ from the browser.

## Feature List

- **Job queue** — enqueue via API/UI, list/filter/sort, full detail view with attempt history.
- **Multi-worker execution** — a supervisor process manages N worker child processes; atomic per-job claiming guarantees no duplicate execution.
- **Retries & backoff** — configurable `maxRetries` per job, exponential backoff (`backoffBase ** retryNumber`).
- **Dead Letter Queue** — list, retry (preserving history), purge — via API and dashboard.
- **Persistence** — every important field survives a restart (MongoDB).
- **Graceful shutdown** — stopping the worker supervisor lets in-flight jobs finish.
- **Stale-job recovery** — jobs orphaned by a crashed worker are automatically returned to pending.
- **Worker heartbeats** — liveness tracked independently of process presence.
- **Job priority and delayed jobs** (`runAt`).
- **Job timeout** with process termination.
- **Authentication** — JWT-based login, protected routes, and an `authGuard` middleware on all sensitive endpoints.
- **Configuration management** entirely through the API/dashboard, validated and persisted.
- **Structured logging** (Winston) to rotating files.
- **React dashboard** — live metrics, job/worker/DLQ tables, status badges, modals, toasts.
- **Cross-platform** — Windows, Linux, macOS.

## Technology Stack

**Backend:** Node.js, Express, MongoDB, Mongoose, JSON Web Tokens (`jsonwebtoken`), bcrypt, `child_process`, Winston (structured logging), Zod (validation), Helmet, CORS, Morgan, Jest + Supertest.

**Frontend:** React, Vite, React Router, Axios, a lightweight global store (Context/Zustand — see `src/store/store.js`), Tailwind/CSS.

## Folder Structure

```
backend/
├── src/
│   ├── config/          # env loading, constants, MongoDB connection
│   ├── controllers/      # request handlers — thin adapters, no business logic
│   ├── middleware/       # auth guard, error handler, request validation
│   ├── models/           # Mongoose schemas (Job, JobAttempt, Worker, ConfigEntry, User)
│   ├── routes/           # Express routers, one per resource
│   ├── services/         # orchestration + business rules (execution, retry, recovery)
│   ├── utils/            # command parsing, logger, process helpers
│   ├── workers/          # supervisor + worker loop, heartbeat, signal handling
│   └── server.js         # app entrypoint
├── tests/
│   └── unit/             # command parser, config validation, retry math
├── .env.example
└── package.json

frontend/
├── src/
│   ├── components/       # Layout, Sidebar, MetricCard, StatusBadge, Modal, Toast
│   ├── pages/             # Dashboard, Jobs, JobDetail, Workers, DLQ, Config, Login
│   ├── services/          # api.js — Axios client + endpoint wrappers
│   ├── store/              # global app state
│   ├── utils/              # datetime formatting helpers
│   ├── App.jsx
│   └── main.jsx
├── .env.example
├── index.html
└── package.json
```

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm.
- MongoDB (local install, or a connection string to MongoDB Atlas).
- Git.

### 1. Clone the repository

```bash
git clone <repository-url>
cd queuectl
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Install frontend dependencies

```bash
cd ../frontend
npm install
```

### 4. Configure environment variables

Copy the example env files and fill in real values:

```bash
# backend/.env
cp backend/.env.example backend/.env

# frontend/.env
cp frontend/.env.example frontend/.env
```

| Variable | Location | Purpose | Default |
|---|---|---|---|
| `PORT` | backend | Port the Express server listens on | `5000` |
| `MONGO_URI` | backend | MongoDB connection string | `mongodb://localhost:27017/queuectl` |
| `JWT_SECRET` | backend | Signing secret for access tokens | — (required) |
| `JWT_REFRESH_SECRET` | backend | Signing secret for refresh tokens | — (required) |
| `JWT_EXPIRES_IN` | backend | Access token lifetime | `15m` |
| `NODE_ENV` | backend | `development` / `production` | `development` |
| `WORKER_COUNT` | backend | Default number of worker processes | `3` |
| `VITE_API_BASE_URL` | frontend | Base URL of the backend API | `http://localhost:5000/api` |

### 5. Start MongoDB

Make sure a MongoDB instance is running and reachable at `MONGO_URI` (a local `mongod`, Docker container, or Atlas cluster).

### 6. Run the backend

```bash
cd backend
npm run dev
```

The database collections are created automatically the first time each Mongoose model is used — no manual migration step is required for a fresh setup.

### 7. Run the frontend

```bash
cd frontend
npm run dev
```

Vite will print a local dev URL (typically `http://localhost:5173`).

### 8. Start workers

Workers are managed by the backend's supervisor. Start them via the API/dashboard, or directly:

```bash
cd backend
node src/workers/supervisor.js --count 3
```

This runs in the foreground and blocks; use a process manager (PM2, `nohup`, systemd, or a Docker restart policy) to keep it running in the background.

### 9. Stop workers

From the dashboard's Workers page, via the API (`POST /api/workers/stop`), or with `Ctrl+C` in the terminal running the supervisor for a graceful shutdown.

## Configuration Reference

All values are persisted in the `configuration` collection and managed via the Config page / `/api/config` endpoints.

| Key | Meaning | Default |
|---|---|---|
| `maxRetries` | Additional retries allowed after the first execution | `3` |
| `backoffBase` | Base of the exponential backoff formula (≥ 1.0) | `2` |
| `workerPollInterval` | Seconds an idle worker waits between claim attempts | `1.0` |
| `workerHeartbeatInterval` | Seconds between heartbeat updates | `2.0` |
| `workerStaleTimeout` | Seconds of heartbeat silence before a worker is considered stale | `15.0` |
| `jobLockTimeout` | Seconds a processing lock may be held before stale-job recovery reclaims it | `30.0` |
| `shutdownTimeout` | Seconds the supervisor waits for graceful worker exit before escalating | `30.0` |
| `defaultJobTimeout` | Default per-job execution timeout (seconds) if not specified at enqueue time | `300` |
| `maxOutputBytes` | Captured stdout/stderr size cap per attempt before truncation | `1000000` |

```
GET    /api/config
GET    /api/config/:key
PUT    /api/config/:key
POST   /api/config/reset
```

## Job Schema

Enqueue payload (`POST /api/jobs`):

```json
{
  "id": "job1",
  "command": "echo Hello",
  "maxRetries": 3,
  "timeout": 300,
  "priority": 0,
  "runAt": "2026-12-31T00:00:00.000Z",
  "shell": false
}
```

Only `id` and `command` are required; everything else falls back to configuration defaults. `command` may be a string (parsed via `utils/commandParser.js` when `shell` is `false`) or an array of argv tokens (recommended — unambiguous).

Persisted job fields: `id`, `command`, `shell`, `state`, `attempts`, `maxRetries`, `priority`, `runAt`, `nextRetryAt`, `timeoutSeconds`, `workerId`, `lockedAt`, `createdAt`, `updatedAt`, `startedAt`, `completedAt`, `exitCode`, `stdout`, `stderr`, `lastError`, `executionDurationMs`, `outputTruncated`.

## API Reference

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/register` | Create a user | No |
| `POST` | `/api/auth/login` | Log in, receive JWT | No |
| `POST` | `/api/auth/refresh` | Refresh access token | Yes (refresh token) |
| `POST` | `/api/auth/logout` | Invalidate session | Yes |
| `POST` | `/api/jobs` | Enqueue a job | Yes |
| `GET` | `/api/jobs` | List/filter jobs | Yes |
| `GET` | `/api/jobs/:id` | Full job detail + attempt history | Yes |
| `GET` | `/api/workers` | List workers and status | Yes |
| `POST` | `/api/workers/start` | Start the worker supervisor | Yes |
| `POST` | `/api/workers/stop` | Gracefully stop workers | Yes |
| `GET` | `/api/dlq` | List Dead Letter Queue | Yes |
| `POST` | `/api/dlq/:id/retry` | Retry a dead job | Yes |
| `DELETE` | `/api/dlq` | Purge the DLQ | Yes |
| `GET` | `/api/config` | List configuration | Yes |
| `PUT` | `/api/config/:key` | Update a config value | Yes |
| `GET` | `/api/status` | Queue + worker status summary | Yes |

All protected routes go through `middleware/authGuard.js`, and all request bodies are validated by `middleware/validator.js` (Zod schemas) before reaching a controller.

## Usage Examples

Enqueue a job:

```bash
curl -X POST http://localhost:5000/api/jobs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"id":"job1","command":"echo Hello"}'
```

Response:

```json
{ "id": "job1", "state": "pending" }
```

Duplicate job error (`409 Conflict`):

```json
{ "error": "Job with id 'job1' already exists." }
```

List jobs:

```bash
curl http://localhost:5000/api/jobs?state=pending \
  -H "Authorization: Bearer <token>"
```

Queue status:

```bash
curl http://localhost:5000/api/status -H "Authorization: Bearer <token>"
```

```json
{
  "pending": 0,
  "processing": 0,
  "completed": 1,
  "failedRetryPending": 0,
  "dead": 1,
  "totalJobs": 2,
  "activeWorkers": 3,
  "staleWorkers": 0
}
```

Dashboard equivalents: the **Dashboard** page shows the same metrics as `MetricCard`s, the **Jobs** page lists/filters jobs with `StatusBadge`s, and the **DLQ** page exposes retry/purge actions as buttons.

## Architecture Overview

- **Route layer** (`routes/`) — maps HTTP verbs/paths to controllers.
- **Controller layer** (`controllers/`) — request/response handling, calls services, no business logic.
- **Validation layer** (`middleware/validator.js`) — schema validation of every request body before it reaches a controller.
- **Service layer** (`services/`) — orchestration and business rules: the claim/execute/record lifecycle, retry policy, recovery policy.
- **Model layer** (`models/`) — Mongoose schemas; all persistence and atomic-claim queries live here.
- **MongoDB persistence** — the `jobs`, `jobattempts`, `workers`, and `configentries` collections.
- **Supervisor process** (`workers/supervisor.js`) — spawns and monitors N worker child processes, coordinates shutdown.
- **Worker processes** (`workers/worker.js`) — each polls, claims, executes, and records independently; a heartbeat interval keeps liveness fresh.
- **Command execution** — isolated to `services/executionService.js`, the only module that spawns child processes.
- **Retry scheduling** — `services/retryService.js`, a pure function computing `nextRetryAt`.
- **Stale-job recovery** — `services/recoveryService.js`, detects and reclaims processing jobs abandoned by a crashed worker.
- **Structured logging** — Winston → rotating log files, with structured fields on every event.

### Job lifecycle

Success path:

```
pending -> processing -> completed
```

Failure and retry path:

```
pending
   -> processing
   -> failed
   -> pending (after backoff)
   -> processing
   -> completed
```

Exhausted-retry path:

```
pending
   -> processing
   -> failed
   -> retries exhausted
   -> dead
```

### Worker logic, step by step

1. Poll for an eligible job (`pending`/`failed` state, `runAt` and `nextRetryAt` both due, ordered by `priority` DESC, `runAt` ASC, `createdAt` ASC).
2. Claim the job atomically: a single conditional `findOneAndUpdate({ _id, state: 'pending' }, { $set: { state: 'processing', ... } })`, checking that a document was actually modified.
3. Execute the command outside any open transaction via `child_process.spawn`, with a timeout.
4. Capture the result: exit code, stdout, stderr, duration, and outcome classification (success / non-zero exit / timeout / command not found / process error).
5. Persist the execution attempt as a new immutable `JobAttempt` document.
6. Mark the job `completed`, `failed` (with a scheduled `nextRetryAt`), or `dead` (retry budget exhausted).
7. Continue polling unless shutdown was requested.

## Retry Semantics

`attempts` = total execution attempts already started (including the one that just finished). `maxRetries` = additional retries allowed after the first execution. Total executions for a job never exceed `1 + maxRetries`.

## Exponential-Backoff Formula

```
delaySeconds = backoffBase ** retryNumber
```

`retryNumber` starts at `1` on the first failure. With the default `backoffBase = 2`: 2s, then 4s, then 8s. `nextRetryAt = now + delaySeconds` is stored on the job and enforced at claim time.

## Atomic-Locking Strategy

A single conditional `findOneAndUpdate` claims a job:

```js
const job = await Job.findOneAndUpdate(
  { _id: jobId, state: "pending" },
  { $set: { state: "processing", workerId, lockedAt: new Date() } },
  { new: true }
);
if (!job) {
  // another worker won the race — try the next candidate
}
```

There is no separate read-then-write window in between: MongoDB's `findOneAndUpdate` performs the match and update atomically at the document level, giving the same guarantee as a conditional `UPDATE ... WHERE` in a relational database.

## Worker Lifecycle

A supervisor process spawns N worker child processes via `child_process.fork`, tracks their PIDs in memory, and listens for `SIGINT`/`SIGTERM` to trigger shutdown. Each worker registers itself in the `workers` collection, runs one stale-job recovery sweep, then loops: poll → claim → execute → record.

## Graceful Shutdown

Stopping the supervisor (via API, dashboard, or `Ctrl+C`) signals all workers to stop claiming new jobs, finish any job already in flight, persist its final state, update their own worker-status document, and exit. The supervisor then waits for all workers to exit (up to `shutdownTimeout`), escalating to forced termination only if a worker hangs past that timeout.

## Dead Letter Queue

`/api/dlq` — list, retry, purge, plus the dashboard's **DLQ** page. A DLQ retry preserves all historical `JobAttempt` documents and does not reset the retry budget — if `attempts` already equals `maxRetries`, the very next failure sends the job straight back to `dead`.

## Persistence Strategy

- **What's stored in MongoDB:** job state and every field listed in [Job Schema](#job-schema), the full per-attempt execution history (`jobattempts`), worker registration/heartbeat history (`workers`), user accounts (`users`), and all configuration key/value pairs (`configentries`).
- **What survives a restart:** everything above — nothing critical is held only in memory.
- **Schema evolution:** managed directly through Mongoose schema definitions in `models/`; no separate migration tool is required for a document database, though you may add one (e.g. `migrate-mongo`) for versioned production upgrades.

## Authentication & Security Model

- Users authenticate via `POST /api/auth/login`, receiving a short-lived JWT access token and a longer-lived refresh token.
- Passwords are hashed with bcrypt before storage — never stored or logged in plaintext.
- `middleware/authGuard.js` verifies the JWT on every protected route and attaches the authenticated user to the request.
- Commands run as argv arrays by default (`shell: false`); shell syntax requires an explicit `"shell": true` opt-in per job.
- QueueCTL executes trusted commands submitted by authenticated users. It is **not** a secure multi-tenant sandbox — never accept job commands from untrusted input without treating it the same as direct shell access.
- NoSQL injection is mitigated by always querying through Mongoose with typed schemas and never interpolating raw user input into query objects.
- Output capture has a configurable size cap (`maxOutputBytes`) to bound storage from runaway command output.
- `helmet`, `cors`, and rate limiting are applied at the Express app level.

## Cross-Platform Support

Runs on Windows, Linux, and macOS. `child_process.spawn`/`fork` behavior is consistent across platforms via Node's built-in abstraction; process-tree termination differs slightly on Windows (no `SIGTERM`-with-cleanup equivalent for arbitrary child processes), handled in `utils/process.js`.

## Logging

Structured JSON logs via Winston, written to rotating log files under `backend/logs/` (or your configured log directory). Every relevant event (`job_enqueued`, `job_claimed`, `job_finished`, `stale_job_recovered`, `worker_started`, etc.) carries structured fields (`jobId`, `workerId`, `supervisorId`, `durationMs`, `exitCode`, ...). Sensitive fields (passwords, tokens) are never logged — only the command itself and non-sensitive metadata.

## Assumptions and Trade-Offs

- **Why MongoDB:** a flexible document model fits the job/attempt/worker/config shape well and pairs naturally with the rest of the MERN stack, avoiding a mixed-database setup.
- **At-least-once, not exactly-once, execution:** stale-job recovery cannot always distinguish "the worker died before running the command" from "died while running it" from "died right after finishing but before the update committed," so a recovered job may occasionally re-execute. Design job commands to be idempotent where this matters.
- **Arbitrary command execution is restricted to trusted, authenticated input** — see [Authentication & Security Model](#authentication--security-model).
- **`shell: true` is disabled by default** — shell syntax is an explicit per-job opt-in, reducing the default attack surface.
- **Stale processing job recovery:** a `processing` job is reclaimed to `pending` (not counted as a failed attempt) if its lock exceeds `jobLockTimeout`, or its worker is no longer active by heartbeat freshness.
- **Retry counting definition:** `attempts` is the total number of executions started so far; `maxRetries` is the number of additional retries allowed; total executions never exceed `1 + maxRetries`.
- **Output size limiting:** captured stdout/stderr is truncated past `maxOutputBytes`; truncation is flagged explicitly (`outputTruncated`) rather than silently dropping data.

This project does not claim: exactly-once delivery, complete security for arbitrary commands, unlimited horizontal scalability, or production suitability for untrusted multi-tenant workloads.

## Testing Instructions

Backend:

```bash
cd backend
npm test                    # full unit suite (Jest)
npm test -- --coverage      # with coverage report
```

Covered by `tests/unit/`:

- `commandParser.test.js` — argv parsing and `shell` handling.
- `configValidator.test.js` — configuration schema validation.
- `retryService.test.js` — exponential-backoff math.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Cannot find package 'express'` on startup | `node_modules` missing — run `npm install` inside the exact folder (`backend/` or `frontend/`) you're running the command from. |
| `'vite' is not recognized` | Frontend dependencies not installed — `cd frontend && npm install`. |
| `npm error ETARGET` on install | A dependency version in `package.json` no longer resolves — check the current version with `npm view <package> version` and update the range. |
| Workers show as stale | Heartbeat interval elapsed without an update — check the worker process is still alive and `workerStaleTimeout` isn't set too low. |
| Jobs sit in `pending` forever | No workers running, or `runAt`/`nextRetryAt` is still in the future — check the job's detail view. |
| `401 Unauthorized` on API calls | JWT missing/expired — log in again or check `JWT_EXPIRES_IN`. |
| MongoDB connection errors on boot | Confirm `MONGO_URI` is correct and MongoDB is running/reachable. |

## Known Limitations

- Single-host only — no distributed coordination across multiple machines without extending the supervisor design.
- No exactly-once execution guarantee — design for idempotent commands where that matters.
- A worker killed with `SIGKILL` cannot forward a graceful signal to its own in-flight child process; the process becomes an orphan reaped by the OS, and the job is picked up by stale-job recovery on the next sweep.
- The worker supervisor does not daemonize itself; backgrounding is left to your process manager of choice (PM2, systemd, Docker restart policy).

## Future Improvements

- WebSocket-based live updates for the dashboard (instead of polling).
- Role-based access control (admin vs. viewer).
- Prometheus metrics endpoint.
- Native recurring/scheduled jobs (cron-like) beyond one-shot `runAt`.
- Horizontal scaling via a message broker for cross-host worker coordination.
- Configurable worker auto-restart-on-crash within the supervisor.

## Repository Link

`<your-repository-url-here>`

## License

MIT
