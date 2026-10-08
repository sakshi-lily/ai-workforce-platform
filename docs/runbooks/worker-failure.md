# Runbook: Worker Failure & Stale Lease Recovery

## 1. Symptoms
- Job queue backlog grows while tasks remain in `RUNNING` status without heartbeats.
- `worker_heartbeats` table shows expired timestamps (>60s).
- Background jobs fail to transition to `COMPLETED` or `WAITING_FOR_APPROVAL`.

## 2. Diagnosis
1. Check Worker ECS Fargate service status:
   ```bash
   aws ecs describe-services --cluster production-ai-workforce-cluster --services production-worker-service
   ```
2. Inspect worker logs for unhandled errors or SIGTERM terminations:
   ```bash
   aws logs tail /ecs/ai-workforce-worker --follow
   ```
3. Query database for stale running tasks:
   ```sql
   SELECT id, status, updated_at FROM tasks WHERE status = 'RUNNING' AND updated_at < NOW() - INTERVAL 5 MINUTE;
   ```

## 3. Safe Recovery
1. Trigger automatic stale task recovery job via API:
   ```bash
   curl -X POST http://<ALB_DNS>/api/recovery/stale-tasks
   ```
2. Restart worker container instances:
   ```bash
   aws ecs update-service --cluster production-ai-workforce-cluster --service production-worker-service --force-new-deployment
   ```
3. Distributed Redlock leases expire automatically after TTL (30s) preventing deadlock.

## 4. Verification
1. Verify worker logs report active queue polling: `[Worker Daemon] Polling job queue...`.
2. Verify stale jobs are re-queued with attempt count incremented.
3. Verify zero unhandled duplicate job executions.

## 5. Escalation
- Escalate to Backend Lead if workers repeatedly crash during specific tool executions.
