# Runbook: Amazon RDS MySQL Database Failure

## 1. Symptoms
- API readiness endpoint `/api/health/readiness` returns HTTP 503 Service Unavailable.
- Express server logs report `connect ECONNREFUSED` or connection pool exhaustion errors.
- User login, task creation, and state updates fail.

## 2. Diagnosis
1. Inspect Amazon RDS instance status in AWS Console:
   ```bash
   aws rds describe-db-instances --db-instance-identifier production-ai-workforce-mysql
   ```
2. Check CloudWatch CPU, FreeStorageSpace, and DatabaseConnections metrics.
3. Check RDS Security Group ingress rules (must permit port 3306 from ECS Security Group).

## 3. Safe Recovery
1. If RDS instance is undergoing automatic Multi-AZ failover, wait 60–120 seconds; connection pool will auto-reconnect.
2. If connection limit exceeded, restart API tasks to drain stale connections:
   ```bash
   aws ecs update-service --cluster production-ai-workforce-cluster --service production-api-service --force-new-deployment
   ```
3. If storage full, allocate additional storage via AWS CLI or modify instance storage autoscaling.

## 4. Verification
1. Test database health check: `curl http://<ALB_DNS>/api/health/db`.
2. Confirm readiness returns `200 OK` with database status `connected`.

## 5. Escalation
- Escalate to Cloud Architect and Database Administrator if storage or compute limits require manual instance resizing.
