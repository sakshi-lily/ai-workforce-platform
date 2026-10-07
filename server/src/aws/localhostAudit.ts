/**
 * AI Workforce Platform — Phase 22: Localhost Endpoint Audit Tool
 *
 * Scans application source code to detect hardcoded local URLs or ports
 * that could accidentally compromise an AWS cloud deployment.
 */

import fs from "fs";
import path from "path";

export interface AuditFinding {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  patternMatched: string;
  isAllowedLocalDefault: boolean;
}

const LOCAL_PATTERNS = [
  "127.0.0.1",
  "localhost:3000",
  "localhost:3306",
  "localhost:6379",
  "localhost:6333",
  "http://localhost",
];

const IGNORED_PATHS = [
  "node_modules",
  "dist",
  "build",
  ".git",
  "testPhase",
  ".test.ts",
  ".spec.ts",
  "test/",
  "tests/",
  "localhostAudit.ts",
];

export function auditLocalhostEndpoints(targetDir: string): {
  totalFilesScanned: number;
  findings: AuditFinding[];
  productionRiskCount: number;
} {
  const findings: AuditFinding[] = [];
  let totalFilesScanned = 0;

  function scan(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (IGNORED_PATHS.some((ignored) => fullPath.includes(ignored))) {
        continue;
      }

      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js") || entry.name.endsWith(".tsx"))) {
        totalFilesScanned++;
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");

        lines.forEach((line, index) => {
          for (const pattern of LOCAL_PATTERNS) {
            if (line.includes(pattern)) {
              // Distinguish safe fallback defaults (e.g. process.env.DB_HOST || "127.0.0.1") or diagnostic logs
              const isAllowedLocalDefault =
                line.includes("process.env") ||
                line.includes("default(") ||
                line.includes("||") ||
                line.includes("??") ||
                line.includes("import.meta.env") ||
                line.includes("console.") ||
                line.includes("DEV");

              findings.push({
                filePath: fullPath,
                lineNumber: index + 1,
                lineContent: line.trim(),
                patternMatched: pattern,
                isAllowedLocalDefault,
              });
              break;
            }
          }
        });
      }
    }
  }

  scan(targetDir);

  const productionRiskCount = findings.filter((f) => !f.isAllowedLocalDefault).length;

  return {
    totalFilesScanned,
    findings,
    productionRiskCount,
  };
}
