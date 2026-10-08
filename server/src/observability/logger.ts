import { CorrelationContext } from "./correlation";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  message: string;
  correlation?: Partial<CorrelationContext>;
  data?: Record<string, unknown>;
}

const REDACTED_KEYS = new Set([
  "password",
  "token",
  "secret",
  "jwt",
  "apikey",
  "api_key",
  "authorization",
  "access_key",
  "secret_key",
  "credentials",
]);

export function sanitizeData(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeData);
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(key.toLowerCase()) || key.toLowerCase().includes("secret") || key.toLowerCase().includes("token")) {
      cleaned[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      cleaned[key] = sanitizeData(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export class StructuredLogger {
  private static buffer: LogEntry[] = [];
  private static maxBufferLength = 200;

  public static log(level: LogLevel, event: string, message: string, data?: Record<string, unknown>, ctx?: Partial<CorrelationContext>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      correlation: ctx,
      data: data ? (sanitizeData(data) as Record<string, unknown>) : undefined,
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.maxBufferLength) {
      this.buffer.shift();
    }

    if (process.env.NODE_ENV !== "test") {
      const output = JSON.stringify(entry);
      if (level === "error") {
        console.error(output);
      } else if (level === "warn") {
        console.warn(output);
      } else {
        console.log(output);
      }
    }

    return entry;
  }

  public static info(event: string, message: string, data?: Record<string, unknown>, ctx?: Partial<CorrelationContext>): LogEntry {
    return this.log("info", event, message, data, ctx);
  }

  public static warn(event: string, message: string, data?: Record<string, unknown>, ctx?: Partial<CorrelationContext>): LogEntry {
    return this.log("warn", event, message, data, ctx);
  }

  public static error(event: string, message: string, data?: Record<string, unknown>, ctx?: Partial<CorrelationContext>): LogEntry {
    return this.log("error", event, message, data, ctx);
  }

  public static getRecentLogs(limit: number = 50): LogEntry[] {
    return this.buffer.slice(-limit);
  }

  public static clearBuffer(): void {
    this.buffer = [];
  }
}
