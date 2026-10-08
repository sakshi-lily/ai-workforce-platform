# Runbook: Production Rollback Procedure

## 1. Symptoms
- Severe regression identified in production following release.
- Post-deployment smoke test suite or live user traffic indicates critical degradation.
- Release decision marked `UNHEALTHY` or `FAILED`.

## 2. Diagnosis
1. Identify currently running task definition revision:
   ```bash
   aws ecs describe-services --cluster production-ai-workforce-cluster --services production-api-service --query "services[0].taskDefinition"
   ```
2. Locate the previous known-good task definition revision and image digest from deployment audit logs.

## 3. Safe Recovery (Rollback Execution)
1. **Automated Trigger:** Handled directly by `rollback-on-failure` job in `.github/workflows/cd.yml`.
2. **Manual Command:**
   ```bash
   aws ecs update-service --cluster production-ai-workforce-cluster --service production-api-service --task-definition ai-workforce-api:PREV_REV
   aws ecs update-service --cluster production-ai-workforce-cluster --service production-worker-service --task-definition ai-workforce-worker:PREV_REV
   aws ecs wait services-stable --cluster production-ai-workforce-cluster --services production-api-service production-worker-service
   ```
3. Record rollback incident in audit logs:
   ```bash
   npx tsx -e "import { rollbackManager } from './src/cicd/rollbackManager'; rollbackManager.executeRollback('ai-workforce-api', 'Manual rollback executed');"
   ```

## 4. Database Safety
- **CRITICAL:** Do NOT automatically roll back database schema migrations unless a breaking forward change was introduced. The backward-compatible expand/contract pattern ensures previous application code can safely operate on the updated schema.

## 5. Verification
1. Run complete smoke test suite: `npm --prefix server run test:smoke`.
2. Verify `/api/health` reports the previous Git commit SHA and version.

## 6. Escalation
- Notify stakeholders on the incident communication channel.
