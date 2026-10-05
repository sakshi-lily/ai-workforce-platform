-- ==============================================================================
-- AI Workforce Platform - Database Schema (MySQL 8.0+)
-- Phase 1 Deliverable: Data Model Definition
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS ai_workforce
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ai_workforce;


-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    organization_name VARCHAR(150) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_email (email)
) ENGINE=InnoDB;

-- 2. Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    prompt TEXT NOT NULL,
    status ENUM('PENDING', 'REQUESTED', 'IN_PROGRESS', 'RUNNING', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    priority ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    constraints_json JSON NULL,
    final_report MEDIUMTEXT NULL,
    error_message TEXT NULL,
    prompt_tokens INT UNSIGNED DEFAULT 0,
    completion_tokens INT UNSIGNED DEFAULT 0,
    total_cost_usd DECIMAL(8, 4) DEFAULT 0.0000,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_tasks_user_status (user_id, status),
    INDEX idx_tasks_created (created_at DESC)
) ENGINE=InnoDB;

-- 3. Task Steps (Subtasks Execution DAG)
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

-- 4. Customers & Prospects Directory
CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
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
    INDEX idx_customers_lookup (domain, company_name)
) ENGINE=InnoDB;

-- 5. Tool Executions (Granular Execution Telemetry)
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

-- 6. Approvals (Human-in-the-Loop Governance Queue)
CREATE TABLE IF NOT EXISTS approvals (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    payload_preview JSON NOT NULL,
    status ENUM('PENDING', 'APPROVED', 'MODIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    reviewer_notes TEXT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    INDEX idx_approvals_status (task_id, status)
) ENGINE=InnoDB;

-- 7. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NULL,
    task_id VARCHAR(36) NULL,
    event_type VARCHAR(100) NOT NULL,
    details_json JSON NOT NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    INDEX idx_audit_event (event_type, created_at DESC)
) ENGINE=InnoDB;

-- 8. AI Telemetry & Execution Metrics (Phase 6)
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

