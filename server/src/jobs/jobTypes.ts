/**
 * AI Workforce Platform — Phase 18: Background Workers & Job Types
 *
 * Defines contracts, states, and configuration for asynchronous background task execution.
 */

export type JobType = "TASK_EXECUTION" | "TASK_RESUME" | "TASK_RETRY";

export type JobStatus =
  | "QUEUED"
  | "ACTIVE"
  | "COMPLETED"
  | "FAILED"
  | "RETRYING"
  | "CANCELLED"
  | "EXHAUSTED";

export type JobPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface JobPayload {
  taskId: string;
  resumeReason?: string;
  options?: {
    mode?: "tools" | "planning";
    allowedTools?: string[];
  };
}

export interface JobEntity {
  id: string;
  task_id: string;
  organization_id: string;
  type: JobType;
  status: JobStatus;
  priority: JobPriority;
  payload: JobPayload;
  attempts: number;
  max_attempts: number;
  worker_id: string | null;
  last_error?: Record<string, unknown> | null;
  locked_until?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerHeartbeatRecord {
  worker_id: string;
  hostname: string;
  pid: number;
  status: "ONLINE" | "BUSY" | "STOPPING" | "OFFLINE";
  concurrency: number;
  active_jobs: number;
  last_heartbeat: string;
  started_at: string;
}

export interface QueueMetrics {
  queued: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  exhausted: number;
  onlineWorkers: number;
}

export const JOB_CONFIG = {
  MAX_ATTEMPTS: 3,
  DEFAULT_CONCURRENCY: 2,
  LOCK_TTL_SECONDS: 300, // 5 minute lock lease
  HEARTBEAT_INTERVAL_MS: 5000, // Heartbeat every 5s
  STALE_HEARTBEAT_TIMEOUT_SECONDS: 30, // 30s without heartbeat considered offline
  BASE_BACKOFF_MS: 1000, // Base delay 1s
  MAX_BACKOFF_MS: 30000, // Max backoff delay 30s
  JITTER_MAX_MS: 500, // Max random jitter
} as const;

export interface CreateJobInput {
  taskId: string;
  organizationId: string;
  type?: JobType;
  priority?: JobPriority;
  payload?: Partial<JobPayload>;
  maxAttempts?: number;
}
