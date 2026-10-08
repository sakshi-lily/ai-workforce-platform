# Runbook: Amazon ElastiCache Redis Failure

## 1. Symptoms
- Application logs report `[Redis Error - Non-fatal] connect ECONNREFUSED` or timeout.
- Cache queries degrade gracefully to direct MySQL queries.
- Job queue operations report fallback or connection retries.

## 2. Diagnosis
1. Inspect ElastiCache cluster health:
   ```bash
   aws elasticache describe-replication-groups --replication-group-id production-ai-workforce-redis
   ```
2. Check security group access on port 6379 from ECS tasks.
3. Check Redis memory usage and eviction rate.

## 3. Safe Recovery
1. Application architecture is designed with **Graceful Degradation**:
   - Cache misses automatically fall back to MySQL queries without taking down the application.
2. If cluster node crashed, ElastiCache Multi-AZ will promote the read replica.
3. Once Redis is reachable, the client library automatically reconnects and resumes caching.

## 4. Verification
1. Verify Redis health endpoint: `curl http://<ALB_DNS>/api/health/redis`.
2. Ensure status reports `connected` and latency < 10ms.

## 5. Escalation
- Escalate to DevOps if cluster requires failover reboot or memory scale-up.
