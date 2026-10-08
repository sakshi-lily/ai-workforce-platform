# Runbook: Deployment Failure & Stabilization Timeouts

## 1. Symptoms
- GitHub Actions CD pipeline fails during `deploy-ecs-fargate` or `verify-and-smoke-test`.
- New ECS tasks fail container healthchecks and are repeatedly replaced by Fargate.
- Production smoke test returns 5xx error or failed assertion.

## 2. Diagnosis
1. Inspect GitHub Actions job logs for failure step.
2. Check ECS deployment events:
   ```bash
   aws ecs describe-services --cluster production-ai-workforce-cluster --services production-api-service --query "services[0].events[:5]"
   ```
3. Check stopped task error codes (`EssentialContainerExited`, `CannotPullContainerError`, `TaskFailedToStart`).

## 3. Safe Recovery
1. The CD workflow triggers **Automated Rollback** automatically upon verification failure.
2. If manual rollback intervention is required, invoke the previous task definition revision:
   ```bash
   aws ecs update-service --cluster production-ai-workforce-cluster --service production-api-service --task-definition ai-workforce-api:PREVIOUS_REVISION
   ```
3. The database migration uses an **Expand Phase** non-destructive schema model, so application rollback does not require immediate database schema reversion.

## 4. Verification
1. Run smoke tests against active ALB: `npm --prefix server run test:smoke`.
2. Confirm ECS services report `ACTIVE` with steady state count.

## 5. Escalation
- Escalate to Release Engineer and Author of the deployment commit.
