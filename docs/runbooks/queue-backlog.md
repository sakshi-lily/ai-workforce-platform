# Runbook: Queue Backlog & Processing Delays

## 1. Symptoms
- Operational dashboard reports high Queue Depth (>50 jobs).
- Task duration increases from seconds to several minutes before pickup.
- Redis memory usage for queue keys increases.

## 2. Diagnosis
1. Query operational metrics dashboard:
   ```bash
   curl http://<ALB_DNS>/api/observability/dashboard
   ```
2. Check running worker count:
   ```bash
   aws ecs describe-services --cluster production-ai-workforce-cluster --services production-worker-service --query "services[0].runningCount"
   ```
3. Check for poison-pill tasks or deadlocks blocking worker execution loops.

## 3. Safe Recovery
1. Scale up ECS Fargate Worker task desired count:
   ```bash
   aws ecs update-service --cluster production-ai-workforce-cluster --service production-worker-service --desired-count 4
   ```
2. Verify Redis distributed locking handles parallel workers safely without duplicate executions.
3. Once queue depth stabilizes, scale desired count back to baseline (2).

## 4. Verification
1. Confirm Queue Depth decreases below 5 in dashboard.
2. Confirm task pickup latency drops back under p95 threshold.

## 5. Escalation
- Escalate to DevOps if high task arrival rates indicate sustained capacity growth.
