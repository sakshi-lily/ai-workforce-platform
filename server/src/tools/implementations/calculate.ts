import { z } from "zod";
import { Tool, ToolContext } from "../types";

export const CalculateInputSchema = z.object({
  expression: z
    .string()
    .min(1, "Expression cannot be empty")
    .max(200, "Expression cannot exceed 200 characters")
    .describe("Mathematical expression to evaluate, e.g. '15 * 4 + 10' or '(1200 / 4) * 1.15'"),
});

export type CalculateInput = z.infer<typeof CalculateInputSchema>;

export const CalculateOutputSchema = z.object({
  expression: z.string(),
  result: z.number(),
});

export type CalculateOutput = z.infer<typeof CalculateOutputSchema>;

/**
 * Evaluates basic arithmetic expressions without eval() or Function().
 * Supports +, -, *, /, %, parentheses, and floating-point numbers.
 */
export function safeEvaluate(expr: string): number {
  // 1. Strict character allowlist check
  if (!/^[0-9+\-*/().%\s]+$/.test(expr)) {
    throw new Error("Invalid characters in expression. Only numbers and operators (+, -, *, /, %, parentheses) are allowed.");
  }

  // 2. Tokenizer
  const tokens = expr.match(/\d+(\.\d+)?|[+\-*/()%]/g);
  if (!tokens || tokens.length === 0) {
    throw new Error("Empty or malformed mathematical expression.");
  }

  let index = 0;

  function peek(): string | undefined {
    return tokens![index];
  }

  function consume(): string {
    return tokens![index++];
  }

  // Grammar:
  // Expr   -> Term (('+' | '-') Term)*
  // Term   -> Factor (('*' | '/' | '%') Factor)*
  // Factor -> ('+' | '-')? Primary
  // Primary-> Number | '(' Expr ')'

  function parseExpr(): number {
    let result = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const nextTerm = parseTerm();
      if (op === "+") result += nextTerm;
      else result -= nextTerm;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = consume();
      const nextFactor = parseFactor();
      if (op === "*") {
        result *= nextFactor;
      } else if (op === "/") {
        if (nextFactor === 0) throw new Error("Division by zero is undefined.");
        result /= nextFactor;
      } else if (op === "%") {
        if (nextFactor === 0) throw new Error("Modulo by zero is undefined.");
        result %= nextFactor;
      }
    }
    return result;
  }

  function parseFactor(): number {
    if (peek() === "-") {
      consume();
      return -parseFactor();
    }
    if (peek() === "+") {
      consume();
      return parseFactor();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const token = consume();
    if (!token) throw new Error("Unexpected end of mathematical expression.");

    if (token === "(") {
      const result = parseExpr();
      if (consume() !== ")") {
        throw new Error("Mismatched parentheses in mathematical expression.");
      }
      return result;
    }

    const num = Number(token);
    if (isNaN(num)) {
      throw new Error(`Unexpected token '${token}' in mathematical expression.`);
    }
    return num;
  }

  const finalResult = parseExpr();
  if (index < tokens.length) {
    throw new Error(`Unexpected extra tokens after valid expression: '${tokens.slice(index).join(" ")}'`);
  }

  return Number(finalResult.toFixed(8));
}

export const calculateTool: Tool<CalculateInput, CalculateOutput> = {
  name: "calculate",
  description: "Safely evaluates basic arithmetic expressions (+, -, *, /, %, parentheses) without external code execution.",
  riskLevel: "LOW_RISK",
  inputSchema: CalculateInputSchema,
  outputSchema: CalculateOutputSchema,

  async execute(input: CalculateInput, _context: ToolContext): Promise<CalculateOutput> {
    const result = safeEvaluate(input.expression);
    return {
      expression: input.expression.trim(),
      result,
    };
  },
};
