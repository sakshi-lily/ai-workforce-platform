/**
 * AI Workforce Platform — Phase 18: Task Execution Lock Manager
 *
 * Implements atomic distributed execution locking using Redis to guarantee
 * that exactly one background worker processes a given task at any moment.
 */

import { initRedis } from "../cache/redis";
import { JOB_CONFIG } from "./jobTypes";

export class LockManager {
  private static instance: LockManager;

  public static getInstance(): LockManager {
    if (!LockManager.instance) {
      LockManager.instance = new LockManager();
    }
    return LockManager.instance;
  }

  private lockKey(taskId: string): string {
    return `task:execution-lock:${taskId}`;
  }

  /**
   * Attempts to acquire an atomic execution lock for a task.
   * Returns true if lock was successfully acquired, false if already locked by another worker.
   */
  public async acquireLock(
    taskId: string,
    workerId: string,
    ttlSeconds: number = JOB_CONFIG.LOCK_TTL_SECONDS
  ): Promise<boolean> {
    const client = await initRedis();
    if (!client) {
      console.warn("[LockManager] Redis unavailable, fallback to single-worker mode");
      return true;
    }

    try {
      const key = this.lockKey(taskId);
      const result = await client.set(key, workerId, {
        EX: ttlSeconds,
        NX: true, // Only set if not already existing
      });
      return result === "OK";
    } catch (err) {
      console.warn("[LockManager Acquire Error]", err);
      return false;
    }
  }

  /**
   * Extends the TTL lease on an already acquired lock (heartbeat).
   */
  public async renewLock(
    taskId: string,
    workerId: string,
    ttlSeconds: number = JOB_CONFIG.LOCK_TTL_SECONDS
  ): Promise<boolean> {
    const client = await initRedis();
    if (!client) return true;

    try {
      const key = this.lockKey(taskId);
      // Lua script to ensure atomic check-and-expire
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("expire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;
      const res = await client.eval(script, {
        keys: [key],
        arguments: [workerId, String(ttlSeconds)],
      });
      return res === 1;
    } catch (err) {
      console.warn("[LockManager Renew Error]", err);
      return false;
    }
  }

  /**
   * Releases an execution lock safely.
   * Only deletes if the lock is currently held by this worker.
   */
  public async releaseLock(taskId: string, workerId: string): Promise<boolean> {
    const client = await initRedis();
    if (!client) return true;

    try {
      const key = this.lockKey(taskId);
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const res = await client.eval(script, {
        keys: [key],
        arguments: [workerId],
      });
      return res === 1;
    } catch (err) {
      console.warn("[LockManager Release Error]", err);
      return false;
    }
  }

  /**
   * Checks whether a task is currently locked and returns the holding worker ID if any.
   */
  public async getLockHolder(taskId: string): Promise<string | null> {
    const client = await initRedis();
    if (!client) return null;

    try {
      const key = this.lockKey(taskId);
      return await client.get(key);
    } catch (err) {
      console.warn("[LockManager Check Error]", err);
      return null;
    }
  }
}

export const lockManager = LockManager.getInstance();
