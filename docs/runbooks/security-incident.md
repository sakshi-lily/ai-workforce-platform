# Runbook: Security Incident & Threat Containment

## 1. Symptoms
- Detection of unauthorized cross-tenant data access attempts (IDOR).
- Detection of adversarial prompt injections seeking to extract secrets or bypass human approval.
- Anomaly detected in token consumption or unusual egress traffic.

## 2. Diagnosis
1. Query structured logs for security events and correlation IDs:
   ```bash
   aws logs filter-log-events --log-group-name /ecs/ai-workforce-api --filter-pattern "AUTHORIZATION_FAILURE"
   ```
2. Inspect `audit_logs` table for suspicious tool execution or approval modification records.
3. Check active JWT tokens and invalidate compromised sessions.

## 3. Safe Recovery & Containment
1. If credential leakage is suspected, rotate secrets immediately in AWS Secrets Manager:
   ```bash
   aws secretsmanager rotate-secret --secret-id production-ai-workforce-secrets
   ```
2. Restart ECS services to pull freshly rotated secrets into memory.
3. If an attacker account or IP is identified, block the origin at ALB / AWS WAF security rules.
4. Human approval boundary ensures external side effects (e.g. `gmailSend`) cannot be dispatched without signed authorization.

## 4. Verification
1. Run repository secret scanner: `npm --prefix server run ci:secrets`.
2. Run security regression suite: `npm --prefix server run test:phase23`.
3. Confirm tenant isolation test: 100% pass across all boundary assertions.

## 5. Escalation
- Immediately notify Chief Information Security Officer (CISO) and Security Response Team.
