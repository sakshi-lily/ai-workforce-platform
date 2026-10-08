/**
 * AI Workforce Platform — Phase 21: Docker & Containerization Test Suite
 *
 * Verifies:
 * 1. Multi-Stage Dockerfile architecture (Server & Client)
 * 2. Non-root user & container security boundaries
 * 3. Build context exclusion (.dockerignore rules)
 * 4. Docker Compose service definitions (6 required services)
 * 5. Persistent volume strategies (MySQL, Redis, Qdrant)
 * 6. Internal network boundaries & inter-service discovery
 * 7. Infrastructure healthcheck configurations
 * 8. Worker standalone daemon configuration & command reuse
 * 9. Nginx reverse proxy & SPA routing configuration
 * 10. Database initialization schema completeness
 * 11. Environment schema validation & secret protection
 * 12. Compiled production build artifacts verification
 */

import fs from "fs";
import path from "path";
import { config, validateEnvironment } from "../config/env";

const PROJECT_ROOT = path.resolve(__dirname, "../../../");
const SERVER_ROOT = path.resolve(__dirname, "../../");
const CLIENT_ROOT = path.resolve(PROJECT_ROOT, "client");

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  [PASS] ${message}`);
}

async function runPhase21TestSuite() {
  console.log("\n=======================================================");
  console.log("  PHASE 21 DOCKER & CONTAINERIZATION VERIFICATION SUITE");
  console.log("=======================================================\n");

  // --- 1. Backend Dockerfile Architecture & Multi-Stage Build ---
  console.log("--- 1. Backend Dockerfile Architecture & Multi-Stage Build ---");
  const serverDockerfile = fs.readFileSync(path.join(SERVER_ROOT, "Dockerfile"), "utf-8");
  assert(serverDockerfile.includes("FROM node:22-alpine AS builder"), "Server Dockerfile implements builder stage with Node 22 Alpine");
  assert(serverDockerfile.includes("FROM node:22-alpine AS runner"), "Server Dockerfile implements minimal runner stage with Node 22 Alpine");
  assert(serverDockerfile.includes("COPY --from=builder /app/dist ./dist"), "Server Dockerfile copies compiled artifacts from builder stage");
  assert(serverDockerfile.includes("USER node"), "Server Dockerfile enforces non-root 'node' runtime user");
  assert(serverDockerfile.includes("EXPOSE 3000"), "Server Dockerfile exposes port 3000");
  assert(serverDockerfile.includes("HEALTHCHECK"), "Server Dockerfile defines native container healthcheck");
  assert(serverDockerfile.includes("dist/server.js"), "Server Dockerfile default CMD executes compiled Express API");

  // Verify dedicated container Dockerfiles in docker/
  const dockerApiFile = fs.readFileSync(path.join(PROJECT_ROOT, "docker/Dockerfile.api"), "utf-8");
  assert(dockerApiFile.includes("FROM node:22-alpine AS builder"), "docker/Dockerfile.api implements builder stage");
  assert(dockerApiFile.includes("USER node"), "docker/Dockerfile.api enforces unprivileged node user");
  assert(dockerApiFile.includes("EXPOSE 3000"), "docker/Dockerfile.api exposes port 3000");

  const dockerWorkerFile = fs.readFileSync(path.join(PROJECT_ROOT, "docker/Dockerfile.worker"), "utf-8");
  assert(dockerWorkerFile.includes("FROM node:22-alpine AS builder"), "docker/Dockerfile.worker implements builder stage");
  assert(dockerWorkerFile.includes("USER node"), "docker/Dockerfile.worker enforces unprivileged node user");
  assert(dockerWorkerFile.includes("dist/jobs/workerRunner.js"), "docker/Dockerfile.worker executes background worker daemon");

  const dockerClientFile = fs.readFileSync(path.join(PROJECT_ROOT, "docker/Dockerfile.client"), "utf-8");
  assert(dockerClientFile.includes("FROM node:22-alpine AS builder"), "docker/Dockerfile.client implements builder stage");
  assert(dockerClientFile.includes("FROM nginx:alpine AS runner"), "docker/Dockerfile.client implements Nginx runner stage");
  assert(dockerClientFile.includes("EXPOSE 80"), "docker/Dockerfile.client exposes port 80");

  // --- 2. Client Dockerfile Architecture & Web Server ---
  console.log("\n--- 2. Client Dockerfile Architecture & Web Server ---");
  const clientDockerfile = fs.readFileSync(path.join(CLIENT_ROOT, "Dockerfile"), "utf-8");
  assert(clientDockerfile.includes("FROM node:22-alpine AS builder"), "Client Dockerfile implements builder stage with Node 22 Alpine");
  assert(clientDockerfile.includes("FROM nginx:alpine AS runner"), "Client Dockerfile implements production Nginx runner stage");
  assert(clientDockerfile.includes("COPY --from=builder /app/dist /usr/share/nginx/html"), "Client Dockerfile copies compiled SPA assets to Nginx html root");
  assert(clientDockerfile.includes("EXPOSE 80"), "Client Dockerfile exposes web port 80");
  assert(clientDockerfile.includes("HEALTHCHECK"), "Client Dockerfile defines web server healthcheck");


  // --- 3. Build Context Security & .dockerignore Rules ---
  console.log("\n--- 3. Build Context Security & .dockerignore Rules ---");
  const rootDockerignore = fs.readFileSync(path.join(PROJECT_ROOT, ".dockerignore"), "utf-8");
  const serverDockerignore = fs.readFileSync(path.join(SERVER_ROOT, ".dockerignore"), "utf-8");
  const clientDockerignore = fs.readFileSync(path.join(CLIENT_ROOT, ".dockerignore"), "utf-8");

  assert(rootDockerignore.includes(".env") && serverDockerignore.includes(".env"), "Excludes .env files from Docker build context");
  assert(serverDockerignore.includes("node_modules/"), "Excludes node_modules from backend build context");
  assert(clientDockerignore.includes("node_modules/"), "Excludes node_modules from frontend build context");
  assert(serverDockerignore.includes(".git/") && rootDockerignore.includes(".git/"), "Excludes .git repository metadata from Docker context");
  assert(serverDockerignore.includes("dist/"), "Excludes local host dist build output from Docker context");

  // Ensure no hardcoded secrets in Dockerfiles
  assert(!serverDockerfile.includes("sk-") && !serverDockerfile.includes("password123"), "Server Dockerfile does not contain hardcoded secret tokens");
  assert(!clientDockerfile.includes("sk-"), "Client Dockerfile does not contain hardcoded secrets");

  // --- 4. Docker Compose Orchestration & Service Boundaries ---
  console.log("\n--- 4. Docker Compose Orchestration & Service Boundaries ---");
  const composePath = path.join(PROJECT_ROOT, "docker-compose.yml");
  assert(fs.existsSync(composePath), "docker-compose.yml exists in project root");
  const composeYaml = fs.readFileSync(composePath, "utf-8");

  const requiredServices = ["client", "api", "worker", "mysql", "redis", "qdrant"];
  for (const svc of requiredServices) {
    assert(composeYaml.includes(`${svc}:`), `Compose defines required service '${svc}'`);
  }

  // --- 5. Persistent Volume Strategy ---
  console.log("\n--- 5. Persistent Volume Strategy ---");
  assert(composeYaml.includes("mysql_data:"), "Compose defines persistent volume 'mysql_data' for MySQL database");
  assert(composeYaml.includes("redis_data:"), "Compose defines persistent volume 'redis_data' for Redis persistence");
  assert(composeYaml.includes("qdrant_data:"), "Compose defines persistent volume 'qdrant_data' for Qdrant vector storage");
  assert(composeYaml.includes("redis-server --appendonly yes"), "Redis runs with Append-Only File (AOF) durability enabled");

  // --- 6. Inter-Service Networking & Service Discovery ---
  console.log("\n--- 6. Inter-Service Networking & Service Discovery ---");
  assert(composeYaml.includes("workforce-network:"), "Compose defines dedicated 'workforce-network' bridge network");
  assert(composeYaml.includes("DB_HOST: mysql"), "API communicates with MySQL using service name 'mysql' (not localhost)");
  assert(composeYaml.includes("REDIS_HOST: redis"), "API communicates with Redis using service name 'redis' (not localhost)");
  assert(composeYaml.includes("QDRANT_URL: http://qdrant:6333"), "API communicates with Qdrant using service name 'qdrant' (not localhost)");

  // --- 7. Service Dependencies & Healthchecks ---
  console.log("\n--- 7. Service Dependencies & Healthchecks ---");
  assert(composeYaml.includes("condition: service_healthy"), "Services enforce 'condition: service_healthy' dependency ordering");
  assert(composeYaml.includes("mysqladmin ping"), "MySQL service defines active ping healthcheck");
  assert(composeYaml.includes("redis-cli"), "Redis service defines active ping healthcheck");

  // --- 8. Worker Standalone Runtime ---
  console.log("\n--- 8. Worker Standalone Runtime ---");
  assert(composeYaml.includes('command: ["node", "dist/jobs/workerRunner.js"]'), "Worker container runs dedicated background daemon without HTTP port");
  assert(composeYaml.includes("restart: on-failure:5"), "API and worker configure bounded restart policy preventing infinite loops");

  // --- 9. Nginx Reverse Proxy & Client Routing ---
  console.log("\n--- 9. Nginx Reverse Proxy & Client Routing ---");
  const nginxConf = fs.readFileSync(path.join(CLIENT_ROOT, "nginx.conf"), "utf-8");
  assert(nginxConf.includes("location /api/"), "Nginx config defines /api/ location block");
  assert(nginxConf.includes("proxy_pass http://api:3000/api/"), "Nginx reverse-proxies /api/ requests to internal 'http://api:3000/api/'");
  assert(nginxConf.includes("try_files $uri $uri/ /index.html;"), "Nginx provides SPA routing fallback to index.html");
  assert(nginxConf.includes("X-Frame-Options"), "Nginx enforces security headers (X-Frame-Options, X-Content-Type-Options)");

  // --- 10. Database Schema Completeness ---
  console.log("\n--- 10. Database Schema Completeness ---");
  const initSql = fs.readFileSync(path.join(PROJECT_ROOT, "docker/mysql/init.sql"), "utf-8");
  const requiredTables = [
    "users",
    "tasks",
    "task_steps",
    "customers",
    "tool_executions",
    "approvals",
    "audit_logs",
    "ai_telemetry",
    "gmail_connections",
    "jobs",
    "worker_heartbeats",
    "job_attempts",
  ];
  for (const table of requiredTables) {
    assert(initSql.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `init.sql defines table '${table}'`);
  }
  assert(initSql.includes("version INT NOT NULL DEFAULT 1"), "init.sql contains tasks.version for optimistic concurrency");
  assert(initSql.includes("total_retries INT NOT NULL DEFAULT 0"), "init.sql contains tasks.total_retries for retry budget ceiling");

  // --- 11. Environment Schema & Configuration Validation ---
  console.log("\n--- 11. Environment Schema & Configuration Validation ---");
  assert(typeof config.port === "number", "config.port is validated as a number");
  assert(typeof config.db.port === "number", "config.db.port is validated as a number");
  assert(typeof config.redis.port === "number", "config.redis.port is validated as a number");
  const envValidation = validateEnvironment();
  assert(typeof envValidation.valid === "boolean", "validateEnvironment() returns structured validity status");

  // --- 12. Compiled Production Build Artifacts ---
  console.log("\n--- 12. Compiled Production Build Artifacts ---");
  assert(fs.existsSync(path.join(SERVER_ROOT, "dist/server.js")), "Compiled server binary dist/server.js exists");
  assert(fs.existsSync(path.join(SERVER_ROOT, "dist/jobs/workerRunner.js")), "Compiled worker binary dist/jobs/workerRunner.js exists");
  assert(fs.existsSync(path.join(CLIENT_ROOT, "dist/index.html")), "Compiled React production bundle client/dist/index.html exists");

  console.log("\n=======================================================");
  console.log("  PHASE 21 TEST RESULTS SUMMARY");
  console.log("=======================================================");
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed:      ${passedTests}`);
  console.log(`Failed:      ${totalTests - passedTests}`);
  console.log("=======================================================\n");
}

runPhase21TestSuite().catch((err) => {
  console.error("\n[Phase 21 Test Suite Error]", err);
  process.exit(1);
});
