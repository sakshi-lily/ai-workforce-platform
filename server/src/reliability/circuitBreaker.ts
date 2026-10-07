/**
 * AI Workforce Platform — Phase 19: Provider Circuit Breaker
 *
 * Implements a lightweight, robust Circuit Breaker for external providers
 * (OpenAI, Gmail, Web Search, Qdrant) to prevent cascading worker failures,
 * API quota waste, and latency spikes when third parties degrade.
 */

import { AppError, ErrorCategory } from "./failureTaxonomy";

export enum CircuitState {
  CLOSED = "CLOSED",       // Normal operation, requests flow through
  OPEN = "OPEN",           // Tripped, fast-fail without calling provider
  HALF_OPEN = "HALF_OPEN", // Testing recovery with a single probe
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Consecutive failures before tripping (default: 3)
  cooldownMs: number;       // Time in ms before entering HALF_OPEN (default: 5000)
  halfOpenMaxTrials: number;// Number of probe successes before closing (default: 1)
}

export interface CircuitMetrics {
  provider: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  consecutiveSuccesses: number;
  lastFailureTime: number | null;
  lastStateChange: number;
  totalTrips: number;
}

export class CircuitBreaker {
  private static instance: CircuitBreaker;
  private readonly config: CircuitBreakerConfig;
  private readonly circuits: Map<string, CircuitMetrics> = new Map();
  private onStateChangeCallback?: (
    provider: string,
    from: CircuitState,
    to: CircuitState
  ) => void;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 3,
      cooldownMs: config?.cooldownMs ?? 5000,
      halfOpenMaxTrials: config?.halfOpenMaxTrials ?? 1,
    };
  }

  public static getInstance(): CircuitBreaker {
    if (!CircuitBreaker.instance) {
      CircuitBreaker.instance = new CircuitBreaker();
    }
    return CircuitBreaker.instance;
  }

  public onStateChange(
    callback: (provider: string, from: CircuitState, to: CircuitState) => void
  ): void {
    this.onStateChangeCallback = callback;
  }

  private getOrCreate(provider: string): CircuitMetrics {
    let metrics = this.circuits.get(provider);
    if (!metrics) {
      metrics = {
        provider,
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        consecutiveSuccesses: 0,
        lastFailureTime: null,
        lastStateChange: Date.now(),
        totalTrips: 0,
      };
      this.circuits.set(provider, metrics);
    }
    return metrics;
  }

  /**
   * Retrieves the current circuit state for a provider, evaluating cooldown expiration.
   */
  public getState(provider: string): CircuitState {
    const metrics = this.getOrCreate(provider);

    if (metrics.state === CircuitState.OPEN) {
      const now = Date.now();
      const elapsed = now - (metrics.lastFailureTime || metrics.lastStateChange);
      if (elapsed >= this.config.cooldownMs) {
        this.transition(metrics, CircuitState.HALF_OPEN);
      }
    }

    return metrics.state;
  }

  private transition(metrics: CircuitMetrics, newState: CircuitState): void {
    const oldState = metrics.state;
    if (oldState === newState) return;

    metrics.state = newState;
    metrics.lastStateChange = Date.now();

    if (newState === CircuitState.OPEN) {
      metrics.totalTrips++;
      console.warn(
        `[CircuitBreaker] Circuit for '${metrics.provider}' TRIPPED OPEN. Failing fast for ${this.config.cooldownMs}ms.`
      );
    } else if (newState === CircuitState.HALF_OPEN) {
      metrics.consecutiveSuccesses = 0;
      console.log(
        `[CircuitBreaker] Circuit for '${metrics.provider}' transitioned to HALF_OPEN. Probing provider...`
      );
    } else if (newState === CircuitState.CLOSED) {
      metrics.failureCount = 0;
      metrics.consecutiveSuccesses = 0;
      console.log(
        `[CircuitBreaker] Circuit for '${metrics.provider}' RECOVERED. Transitioned to CLOSED.`
      );
    }

    if (this.onStateChangeCallback) {
      try {
        this.onStateChangeCallback(metrics.provider, oldState, newState);
      } catch (err) {
        console.warn("[CircuitBreaker State Change Callback Error]", err);
      }
    }
  }

  /**
   * Wraps an asynchronous operation with circuit breaker protection.
   */
  public async execute<T>(provider: string, fn: () => Promise<T>): Promise<T> {
    const state = this.getState(provider);

    if (state === CircuitState.OPEN) {
      throw new AppError({
        code: "CIRCUIT_BREAKER_OPEN",
        category: ErrorCategory.PROVIDER_ERROR,
        message: `Provider '${provider}' is temporarily degraded. Circuit is OPEN (failing fast).`,
        userFacingMessage: `The external service '${provider}' is temporarily unavailable. Work has been queued for recovery.`,
        provider,
        details: { provider, state: CircuitState.OPEN },
      });
    }

    try {
      const result = await fn();
      this.recordSuccess(provider);
      return result;
    } catch (err) {
      this.recordFailure(provider, err);
      throw err;
    }
  }

  /**
   * Records a successful execution.
   */
  public recordSuccess(provider: string): void {
    const metrics = this.getOrCreate(provider);
    metrics.successCount++;

    if (metrics.state === CircuitState.HALF_OPEN) {
      metrics.consecutiveSuccesses++;
      if (metrics.consecutiveSuccesses >= this.config.halfOpenMaxTrials) {
        this.transition(metrics, CircuitState.CLOSED);
      }
    } else if (metrics.state === CircuitState.CLOSED) {
      // Reset transient failure counter on regular success
      metrics.failureCount = 0;
    }
  }

  /**
   * Records an execution failure.
   */
  public recordFailure(provider: string, err?: unknown): void {
    const metrics = this.getOrCreate(provider);
    metrics.failureCount++;
    metrics.lastFailureTime = Date.now();

    if (metrics.state === CircuitState.CLOSED) {
      if (metrics.failureCount >= this.config.failureThreshold) {
        this.transition(metrics, CircuitState.OPEN);
      }
    } else if (metrics.state === CircuitState.HALF_OPEN) {
      // Any failure during trial immediately re-trips the circuit
      this.transition(metrics, CircuitState.OPEN);
    }
  }

  /**
   * Manually sets last failure timestamp for testing or recovery purposes.
   */
  public setLastFailureTime(provider: string, timestamp: number): void {
    const metrics = this.getOrCreate(provider);
    metrics.lastFailureTime = timestamp;
    metrics.lastStateChange = timestamp;
  }

  /**
   * Forces a circuit state (useful for administrative reset or testing).
   */
  public forceState(provider: string, state: CircuitState): void {
    const metrics = this.getOrCreate(provider);
    this.transition(metrics, state);
  }

  /**
   * Resets a provider's circuit state to CLOSED (useful for testing or operator intervention).
   */
  public reset(provider: string): void {
    const metrics = this.getOrCreate(provider);
    this.transition(metrics, CircuitState.CLOSED);
    metrics.failureCount = 0;
    metrics.consecutiveSuccesses = 0;
    metrics.lastFailureTime = null;
  }

  /**
   * Returns a snapshot of all circuit states and metrics for health telemetry.
   */
  public getAllMetrics(): Record<string, CircuitMetrics> {
    const result: Record<string, CircuitMetrics> = {};
    for (const [provider, metrics] of this.circuits.entries()) {
      // Call getState to update any expired cooldowns
      this.getState(provider);
      result[provider] = { ...metrics };
    }
    return result;
  }
}

export const circuitBreaker = CircuitBreaker.getInstance();
