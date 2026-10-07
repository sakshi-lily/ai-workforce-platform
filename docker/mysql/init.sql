-- ==============================================================================
-- AI Workforce Platform - Production-Like MySQL Initialization Schema
-- Phase 21: Full Database Definition Covering Phases 1-20
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS ai_workforce
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ai_workforce;

-- 1. Users Table (Phase 13 Multi-Tenant Authentication & RBAC)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    organization_name VARCHAR(150) NULL,
    organization_id VARCHAR(64) NOT NULL DEFAULT 'org-demo-001',
    role ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_email (email),
    INDEX idx_users_org (organization_id)
) ENGINE=InnoDB;

-- 2. Tasks Table (With Phase 19 Optimistic Concurrency & Retry Budget Fields)
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    organization_id VARCHAR(64) NOT NULL DEFAULT 'org-demo-001',
    title VARCHAR(255) NOT NULL,
    prompt TEXT NOT NULL,
    status ENUM('PENDING', 'REQUESTED', 'IN_PROGRESS', 'RUNNING', 'WAITING_FOR_APPROVAL', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    priority ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    constraints_json JSON NULL,
    final_report MEDIUMTEXT NULL,
    error_message TEXT NULL,
    prompt_tokens INT UNSIGNED DEFAULT 0,
    completion_tokens INT UNSIGNED DEFAULT 0,
    total_cost_usd DECIMAL(8, 4) DEFAULT 0.0000,
    version INT NOT NULL DEFAULT 1,
    total_retries INT NOT NULL DEFAULT 0,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_tasks_org_created (organization_id, created_at DESC),
    INDEX idx_tasks_user_status (user_id, status),
    INDEX idx_tasks_created (created_at DESC)
) ENGINE=InnoDB;

-- 3. Task Steps Table (Subtasks Execution Plan)
CREATE TABLE IF NOT EXISTS task_steps (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    step_order INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    tool_name VARCHAR(100) NULL,
    input_data JSON NULL,
    output_data JSON NULL,
    error_message TEXT NULL,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    INDEX idx_task_steps_order (task_id, step_order)
) ENGINE=InnoDB;

-- 4. Customers Directory (Tenant-Scoped CRM Data)
CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    organization_id VARCHAR(64) NOT NULL DEFAULT 'org-demo-001',
    company_name VARCHAR(150) NOT NULL,
    domain VARCHAR(150) NOT NULL,
    contact_name VARCHAR(100) NULL,
    contact_email VARCHAR(255) NULL,
    industry VARCHAR(100) NULL,
    qualification_score INT UNSIGNED NULL,
    qualification_rationale TEXT NULL,
    status ENUM('NEW', 'QUALIFIED', 'CONTACTED', 'DISQUALIFIED', 'CUSTOMER') NOT NULL DEFAULT 'NEW',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_domain (user_id, domain),
    INDEX idx_customers_org (organization_id),
    INDEX idx_customers_lookup (domain, company_name)
) ENGINE=InnoDB;

-- 5. Tool Executions Table (Telemetry)
CREATE TABLE IF NOT EXISTS tool_executions (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    step_id VARCHAR(36) NULL,
    tool_name VARCHAR(100) NOT NULL,
    input_payload JSON NOT NULL,
    output_payload MEDIUMTEXT NULL,
    duration_ms INT UNSIGNED NOT NULL,
    is_error BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (step_id) REFERENCES task_steps(id) ON DELETE SET NULL,
    INDEX idx_tool_exec_task (task_id, tool_name)
) ENGINE=InnoDB;

-- 6. Approvals Table (Phase 17 Human Governance & Anti-Tampering)
CREATE TABLE IF NOT EXISTS approvals (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    tool_name VARCHAR(100) NOT NULL DEFAULT 'unknown',
    action_type VARCHAR(100) NOT NULL,
    payload_preview JSON NOT NULL,
    status ENUM('PENDING', 'APPROVED', 'MODIFIED', 'REJECTED', 'EXECUTING', 'EXECUTED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    risk_level ENUM('READ_ONLY', 'LOW_RISK', 'MUTATING', 'EXTERNAL_SIDE_EFFECT') NOT NULL DEFAULT 'EXTERNAL_SIDE_EFFECT',
    requested_by VARCHAR(64) NULL,
    approver_id VARCHAR(64) NULL,
    decision_note TEXT NULL,
    reviewed_at TIMESTAMP NULL,
    executed_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    execution_error TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    INDEX idx_approvals_status (task_id, status)
) ENGINE=InnoDB;

-- 7. Audit Logs Table (Immutable Compliance Record)
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(64) NULL,
    organization_id VARCHAR(64) NULL,
    task_id VARCHAR(36) NULL,
    event_type VARCHAR(100) NOT NULL,
    action VARCHAR(100) NULL,
    details_json JSON NOT NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    INDEX idx_audit_event (event_type, created_at DESC),
    INDEX idx_audit_org (organization_id)
) ENGINE=InnoDB;

-- 8. AI Telemetry Table (Token Usage & Financial Tracking)
CREATE TABLE IF NOT EXISTS ai_telemetry (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    prompt_type VARCHAR(50) NOT NULL DEFAULT 'text',
    prompt_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    completion_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    total_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    latency_ms INT UNSIGNED NOT NULL DEFAULT 0,
    estimated_cost_usd DECIMAL(8, 6) NOT NULL DEFAULT 0.000000,
    status ENUM('SUCCESS', 'FAILED') NOT NULL DEFAULT 'SUCCESS',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    INDEX idx_ai_telemetry_created (created_at DESC)
) ENGINE=InnoDB;

-- 9. Gmail Connections Table (Phase 16 Encrypted OAuth Credentials)
CREATE TABLE IF NOT EXISTS gmail_connections (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    organization_id VARCHAR(64) NOT NULL,
    provider VARCHAR(32) NOT NULL DEFAULT 'google',
    email_address VARCHAR(255) NOT NULL,
    provider_account_id VARCHAR(255) NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    token_expires_at TIMESTAMP NOT NULL,
    scopes JSON NOT NULL,
    status ENUM('CONNECTED', 'DISCONNECTED', 'EXPIRED', 'REAUTH_REQUIRED', 'ERROR') NOT NULL DEFAULT 'CONNECTED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_gmail_user_org (user_id, organization_id),
    INDEX idx_gmail_email (email_address),
    INDEX idx_gmail_status (status)
) ENGINE=InnoDB;

-- 10. Jobs Table (Phase 18 Redis Queue Operational State)
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(64) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    organization_id VARCHAR(64) NOT NULL,
    type ENUM('TASK_EXECUTION', 'TASK_RESUME', 'TASK_RETRY') NOT NULL DEFAULT 'TASK_EXECUTION',
    status ENUM('QUEUED', 'ACTIVE', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELLED', 'EXHAUSTED') NOT NULL DEFAULT 'QUEUED',
    priority ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    worker_id VARCHAR(64) NULL,
    last_error TEXT NULL,
    payload JSON NULL,
    available_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    failed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_jobs_status_prio_avail (status, priority, available_at),
    INDEX idx_jobs_task_status (task_id, status),
    INDEX idx_jobs_org_status (organization_id, status)
) ENGINE=InnoDB;

-- 11. Worker Heartbeats Table (Phase 18 Worker Cluster Telemetry)
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    worker_id VARCHAR(64) PRIMARY KEY,
    process_id INT NOT NULL,
    status ENUM('ONLINE', 'DRAINING', 'STOPPED', 'CRASHED', 'OFFLINE') NOT NULL DEFAULT 'ONLINE',
    concurrency INT NOT NULL DEFAULT 2,
    active_jobs INT NOT NULL DEFAULT 0,
    last_heartbeat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_worker_status_hb (status, last_heartbeat)
) ENGINE=InnoDB;

-- 12. Job Attempts Table (Phase 19 Historical Execution Audit)
CREATE TABLE IF NOT EXISTS job_attempts (
    id VARCHAR(64) PRIMARY KEY,
    job_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(36) NOT NULL,
    organization_id VARCHAR(64) NOT NULL,
    attempt_number INT NOT NULL,
    worker_id VARCHAR(64) NULL,
    status ENUM('RUNNING', 'COMPLETED', 'FAILED') NOT NULL,
    error_code VARCHAR(64) NULL,
    error_category VARCHAR(64) NULL,
    error_details TEXT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    duration_ms INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_job_attempts_task (task_id, attempt_number),
    INDEX idx_job_attempts_job (job_id, attempt_number),
    INDEX idx_job_attempts_org (organization_id, created_at)
) ENGINE=InnoDB;

-- Seed Default Demo User (Password: "password123", bcrypt hash)
INSERT IGNORE INTO users (id, email, password_hash, full_name, organization_name, organization_id, role)
VALUES (
    'usr_demo_admin_001',
    'admin@example.com',
    '$2a$10$wT282n0aJ2EskJ523vC2..7oD0eH4.y5f6Yy7p1X1b2v3c4d5e6f7',
    'Platform Administrator',
    'Apex Enterprise',
    'org-demo-001',
    'ADMIN'
);

-- Seed Initial CRM Customers
INSERT IGNORE INTO customers (id, user_id, organization_id, company_name, domain, contact_name, contact_email, industry, qualification_score, status)
VALUES
    ('cust_demo_001', 'usr_demo_admin_001', 'org-demo-001', 'Acme Corp', 'acme.com', 'Alice Smith', 'alice@acme.com', 'Technology', 85, 'QUALIFIED'),
    ('cust_demo_002', 'usr_demo_admin_001', 'org-demo-001', 'Globex International', 'globex.io', 'Bob Jones', 'bob@globex.io', 'Logistics', 92, 'QUALIFIED'),
    ('cust_demo_003', 'usr_demo_admin_001', 'org-demo-001', 'Soylent Health', 'soylent.co', 'Carol Danvers', 'carol@soylent.co', 'Healthcare', 60, 'CONTACTED');
