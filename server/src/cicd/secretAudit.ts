import fs from "fs";
import path from "path";

export interface SecretViolation {
  filePath: string;
  line: number;
  patternType: string;
  snippet: string;
}

export interface SecretScanResult {
  passed: boolean;
  filesScanned: number;
  violations: SecretViolation[];
}

const SECRET_PATTERNS: Array<{ type: string; regex: RegExp }> = [
  { type: "AWS Access Key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { type: "AWS Secret Access Key", regex: /(?:aws_secret_access_key|awsSecretAccessKey)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/i },
  { type: "Private Key Header", regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { type: "OpenAI Live Secret Key", regex: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/ },
  { type: "Hardcoded Password Assignment", regex: /(?:password|client_secret)\s*[:=]\s*["'](?!.*(?:mock|test|dummy|example|placeholder|<.*>|CHANGE_ME|YOUR_|\$|process\.env))[A-Za-z0-9@#$%^&+=!_-]{12,}["']/i },
];

const IGNORED_PATHS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".env.example",
  ".env.docker.example",
  "storage",
  "qdrant_storage",
  "package-lock.json",
  "testPhase",
  ".test.ts",
  ".spec.ts",
];

export function scanFileForSecrets(filePath: string): SecretViolation[] {
  const violations: SecretViolation[] = [];
  try {
    const normalizedPath = filePath.replace(/\\/g, "/");
    if (IGNORED_PATHS.some((ignored) => normalizedPath.includes(ignored))) {
      return violations;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip commented examples or placeholders
      if (
        line.includes("EXAMPLE") ||
        line.includes("placeholder") ||
        line.includes("YOUR_") ||
        line.includes("YourSecure") ||
        line.includes("test_") ||
        line.includes("rootpassword") ||
        line.includes("ValidPassword")
      ) {
        continue;
      }

      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(line)) {
          violations.push({
            filePath,
            line: i + 1,
            patternType: pattern.type,
            snippet: line.trim().substring(0, 80),
          });
        }
      }
    }
  } catch {
    // skip unreadable
  }
  return violations;
}

export function scanRepositoryForSecrets(rootDirectory: string): SecretScanResult {
  const violations: SecretViolation[] = [];
  let filesScanned = 0;

  function traverse(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relative = path.relative(rootDirectory, fullPath).replace(/\\/g, "/");

      if (IGNORED_PATHS.some((ignored) => relative.includes(ignored))) {
        continue;
      }

      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".ts", ".js", ".json", ".yml", ".yaml", ".md", ".env"].includes(ext) || entry.name.startsWith(".env")) {
          filesScanned++;
          const fileViolations = scanFileForSecrets(fullPath);
          violations.push(...fileViolations);
        }
      }
    }
  }

  traverse(rootDirectory);

  return {
    passed: violations.length === 0,
    filesScanned,
    violations,
  };
}
