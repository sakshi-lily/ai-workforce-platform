# Phase 21 — Docker, Containerization & Production-Like Local Environment

## 1. Overview & Core Architecture

Phase 21 containerizes the complete **AI Workforce Platform** using Docker and Docker Compose, establishing a reproducible, isolated, and production-like runtime environment that operates consistently across any developer workstation.

> **Core Docker Principle:** Containers package application environments; they do not replace application architecture. Authentication, multi-tenant isolation, tool governance, approval lifecycles, and reliability boundaries remain strictly enforced by application code.

### 1.1 High-Level Container Topology

```text
                                  BROWSER
                                     |
                                     v
                           +-------------------+
                           |  CLIENT (Nginx)   |  Port 80 / 5173
                           |  (SPA + /api/ px) |
                           +-------------------+
                                     |
                          Internal Docker Network
                           (workforce-network)
                                     |
                                     v
                           +-------------------+
                           |     API (Node)    |  Port 3000
                           |  Express Gateway  |
                           +-------------------+
                               |     |     |
                 +-------------+     |     +-------------+
                 v                   v                   v
         +---------------+   +---------------+   +---------------+
         | MySQL 8.4     |   | Redis 7       |   | Qdrant 1.13   |
         | Relational DB |   | Queue & Locks |   | Vector Engine |
         | Port 3306     |   | Port 6379     |   | Port 6333     |
         | [mysql_data]  |   | [redis_data]  |   | [qdrant_data] |
         +---------------+   +---------------+   +---------------+
                                     ^
                                     |
                           +-------------------+
                           |   WORKER (Node)   |  (No Public Port)
                           | Background Daemon |
                           +-------------------+
                                     |
                      +--------------+--------------+
                      |              |              |
                      v              v              v
                   OpenAI           Web           Gmail
                 (External)      (External)     (External)
```

---

## 2. Container Boundaries & Responsibilities

| Container | Base Image | Role | Port(s) | User |
| :--- | :--- | :--- | :--- | :--- |
| **`client`** | `nginx:alpine` (multi-stage) | Serves compiled React SPA; reverse proxies `/api/` to `api:3000` | `80:80`, `5173:80` | `nginx` |
| **`api`** | `node:22-alpine` (multi-stage) | Express HTTP API, auth, tool registry, task router | `3000:3000` | `node` (non-root) |
| **`worker`** | `node:22-alpine` (reuses image) | Autonomous background queue worker (`dist/jobs/workerRunner.js`) | None (Internal) | `node` (non-root) |
| **`mysql`** | `mysql:8.4` | Relational source of truth, multi-tenant data, audit logs | `3306:3306` | `mysql` |
| **`redis`** | `redis:7-alpine` | Priority job queues, distributed locks, fast cache (`--appendonly yes`) | `6379:6379` | `redis` |
| **`qdrant`** | `qdrant/qdrant:v1.13.0` | Vector database for semantic document search & RAG | `6333:6333` | `qdrant` |

---

## 3. Quickstart & Deployment

### 3.1 Prerequisites
- Docker Engine 24.0+ and Docker Compose v2.20+
- Host machine with at least 4 GB RAM available

### 3.2 Environment Configuration
Copy the Docker environment template:
```bash
cp .env.docker.example .env
```
Ensure your external API credentials (`OPENAI_API_KEY`, etc.) are filled in `.env`. **Secrets are injected dynamically at runtime and never baked into container images.**

### 3.3 Starting the Platform
```bash
docker compose up -d --build
```
This builds production images for `api`, `worker`, and `client`, initializes the database schema, launches the internal bridge network, and starts healthcheck monitoring.

### 3.4 Checking Health & Status
```bash
docker compose ps
```
Expected output:
```text
NAME                   IMAGE                 STATUS                   PORTS
ai-workforce-mysql     mysql:8.4             Up (healthy)             0.0.0.0:3306->3306/tcp
ai-workforce-redis     redis:7-alpine        Up (healthy)             0.0.0.0:6379->6379/tcp
ai-workforce-qdrant    qdrant/qdrant:v1.13.0 Up (healthy)             0.0.0.0:6333->6333/tcp
ai-workforce-api       ai-workforce-api      Up (healthy)             0.0.0.0:3000->3000/tcp
ai-workforce-worker    ai-workforce-api      Up                       
ai-workforce-client    ai-workforce-client   Up (healthy)             0.0.0.0:80->80/tcp, 0.0.0.0:5173->80/tcp
```

### 3.5 Accessing the Application
- **Frontend Dashboard:** [http://localhost](http://localhost) (or [http://localhost:5173](http://localhost:5173))
- **Backend API Direct:** [http://localhost:3000/api/health](http://localhost:3000/api/health)
- **Default Admin Demo User:** `admin@example.com` / `password123`

---

## 4. Lifecycle & Volume Management

### 4.1 Stopping the Platform (Preserving Data)
```bash
docker compose down
```
> [!NOTE]
> `docker compose down` stops and removes containers but **preserves all named volumes** (`mysql_data`, `redis_data`, `qdrant_data`). All database records, background jobs, and vector embeddings persist intact across restarts.

### 4.2 Destructive Reset (Deleting All Persistent Data)
```bash
docker compose down -v
```
> [!CAUTION]
> The `-v` flag deletes all persistent local volumes (`mysql_data`, `redis_data`, `qdrant_data`). The database and vector index will be completely wiped and reinitialized from scratch on the next launch.

### 4.3 Viewing Container Logs
```bash
# View all logs
docker compose logs -f

# View API logs only
docker compose logs -f api

# View Worker execution logs only
docker compose logs -f worker
```

---

## 5. Reverse Proxy & Networking Details

### 5.1 Browser Networking Context vs Docker Network
Inside the Docker network, services communicate by container service name:
- API connects to MySQL at `mysql:3306`
- API connects to Redis at `redis:6379`
- API connects to Qdrant at `http://qdrant:6333`

However, **a user's browser runs outside Docker** on the host machine. If client JavaScript made requests to `http://api:3000`, browser DNS resolution would fail.

### 5.2 Nginx Reverse Proxy Solution
The `client` container incorporates a production Nginx reverse proxy:
1. Static files (`/index.html`, `/assets/*`) are served with HTTP compression and cache headers.
2. API requests to `/api/*` are transparently proxied to `http://api:3000/api/` inside the Docker network.
3. This eliminates Cross-Origin Resource Sharing (CORS) friction and provides a single, unified origin for the browser.

---

## 6. Security & Container Hardening

1. **Non-Root Runtime:** The API and Worker containers execute under the unprivileged `USER node` account (UID 1000).
2. **Multi-Stage Builds:** Development dependencies (`typescript`, `@types/*`, `tsx`) and source files are excluded from final runner images, drastically reducing image size and attack surface.
3. **No Hardcoded Secrets:** `.dockerignore` prevents accidental inclusion of `.env`, `.pem`, `.git`, or credential files into build contexts. Secrets are supplied strictly via environment variables.
4. **Minimal Port Exposure:** The background worker does not expose any host or HTTP ports. Redis, MySQL, and Qdrant ports can be bound to localhost or isolated completely in staging/production.
5. **No Privileged Mode:** Containers run without `privileged: true` or unnecessary Linux capabilities.

---

## 7. Troubleshooting Guide

### 7.1 API Cannot Connect to MySQL
- **Symptom:** `ECONNREFUSED` or `ETIMEDOUT` on `mysql:3306`.
- **Cause:** MySQL container is still performing initial table creation.
- **Remedy:** Ensure `depends_on` specifies `condition: service_healthy`. Check MySQL logs with `docker compose logs mysql`.

### 7.2 Worker Does Not Consume Queued Jobs
- **Symptom:** Tasks remain in `QUEUED` status; worker shows 0 active jobs.
- **Cause:** Worker failed to authenticate to Redis or crashed.
- **Remedy:** Check worker logs: `docker compose logs worker`. Verify Redis is healthy: `docker compose exec redis redis-cli ping`.

### 7.3 Qdrant Vectors Not Persisting
- **Symptom:** Knowledge documents disappear after restarting containers.
- **Cause:** `qdrant_data` volume is not mounted or was launched with `-v`.
- **Remedy:** Verify volume mount: `docker volume inspect ai-workforce-qdrant-data`.

### 7.4 Resetting Database Schema
If you need to refresh table structures:
```bash
docker compose down -v
docker compose up -d
```
The MySQL initialization script at `docker/mysql/init.sql` will execute automatically upon clean database startup.
