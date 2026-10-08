# Runbook: API Down

## 1. Symptoms
- ALB target group marks API tasks unhealthy.
- `/api/health/liveness` or `/api/health/readiness` returns HTTP 5xx or fails with connection timeout.
- Client SPA displays network connectivity errors.

## 2. Diagnosis
1. Check ECS Fargate task status:
   ```bash
   aws ecs describe-services --cluster production-ai-workforce-cluster --services production-api-service
   ```
2. Inspect CloudWatch logs for process crashes or unhandled exceptions:
   ```bash
   aws logs tail /ecs/ai-workforce-api --follow
   ```
3. Verify underlying database connectivity from API tasks.

## 3. Safe Recovery
1. If tasks are stopped due to memory or CPU exhaustion, trigger a forced deployment:
   ```bash
   aws ecs update-service --cluster production-ai-workforce-cluster --service production-api-service --force-new-deployment
   ```
2. If configuration or bad commit caused the crash, initiate automated rollback to previous stable task definition.

## 4. Verification
1. Verify liveness probe: `curl -f http://<ALB_DNS>/api/health/liveness` returns HTTP 200.
2. Verify readiness probe: `curl -f http://<ALB_DNS>/api/health/readiness` returns HTTP 200.
3. Check ALB target group health: all targets in `healthy` state.

## 5. Escalation
- If failure persists after 10 minutes, escalate to Lead Infrastructure Engineer and On-Call Release Manager.
