/**
 * AI Workforce Platform — Phase 14: Task State Machine & Transitions
 *
 * Implements deterministic lifecycle state transitions.
 * Follows the Golden Rule: The application owns task state transitions;
 * the LLM proposes, the application verifies and controls.
 */

import { TaskLifecycleState } from "./taskTypes";

export class InvalidTaskStateTransitionError extends Error {
  public code: string;
  public statusCode: number;
  public fromState: string;
  public toState: string;

  constructor(fromState: string, toState: string) {
    super(`Cannot transition task from state '${fromState}' to '${toState}'.`);
    this.name = "InvalidTaskStateTransitionError";
    this.code = "INVALID_TASK_STATE_TRANSITION";
    this.statusCode = 409;
    this.fromState = fromState;
    this.toState = toState;
  }
}

/**
 * Task transition table definition:
 *
 * | Current   | Next       | Allowed |
 * |-----------|------------|---------|
 * | REQUESTED | RUNNING    | Yes     |
 * | REQUESTED | CANCELLED  | Yes     |
 * | RUNNING   | COMPLETED  | Yes     |
 * | RUNNING   | FAILED     | Yes     |
 * | RUNNING   | CANCELLED  | Yes     |
 * | COMPLETED | *          | No      |
 * | FAILED    | *          | No      |
 * | CANCELLED | *          | No      |
 */
export const ALLOWED_TRANSITIONS: Record<TaskLifecycleState, TaskLifecycleState[]> = {
  REQUESTED: ["QUEUED", "RUNNING", "CANCELLED"],
  QUEUED: ["RUNNING", "CANCELLED", "FAILED"],
  RUNNING: ["COMPLETED", "FAILED", "CANCELLED", "WAITING_FOR_APPROVAL", "QUEUED"],
  WAITING_FOR_APPROVAL: ["QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [], // Terminal
  FAILED: [],    // Terminal
  CANCELLED: [], // Terminal
};

/**
 * Validates whether transitioning from `fromState` to `toState` is permitted.
 */
export function canTransitionTask(
  fromState: TaskLifecycleState,
  toState: TaskLifecycleState
): boolean {
  return ALLOWED_TRANSITIONS[fromState]?.includes(toState) ?? false;
}

/**
 * Asserts that a state transition is legal, throwing a typed 409 error if invalid.
 */
export function assertValidTaskTransition(
  fromState: TaskLifecycleState,
  toState: TaskLifecycleState
): void {
  if (!canTransitionTask(fromState, toState)) {
    throw new InvalidTaskStateTransitionError(fromState, toState);
  }
}
