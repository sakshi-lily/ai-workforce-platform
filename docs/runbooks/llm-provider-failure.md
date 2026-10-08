# Runbook: LLM Provider Failure & Rate Limiting

## 1. Symptoms
- Agent execution times out or returns HTTP 429 Too Many Requests from OpenAI / external provider.
- Telemetry shows high LLM latency (>25s) or API error rate spikes.
- Circuit breaker transitions to `OPEN` state.

## 2. Diagnosis
1. Inspect AI health endpoint:
   ```bash
   curl http://<ALB_DNS>/api/health/ai
   ```
2. Check external provider status page (e.g. status.openai.com).
3. Review token consumption rate and circuit breaker status in operational metrics dashboard.

## 3. Safe Recovery
1. The platform's built-in **Circuit Breaker** trips after consecutive failures, fast-failing subsequent calls to protect task budget.
2. If rate limited, worker exponential backoff with jitter delays retry attempts without overwhelming the upstream API.
3. If primary model has an outage, update `LLM_MODEL` in AWS Secrets Manager to configured fallback model.

## 4. Verification
1. Verify `/api/health/ai` returns `status: "ok"` and `ai: "ready"`.
2. Confirm circuit breaker transitions from `HALF_OPEN` back to `CLOSED`.

## 5. Escalation
- Escalate to Product Lead and AI Platform Owner if quota limits require tier upgrades.
