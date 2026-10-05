import OpenAI from "openai";
import { Tool, ToolContext, ToolExecutionEnvelope, ToolSummary } from "./types";
import { getCurrentTimeTool } from "./implementations/getCurrentTime";
import { calculateTool } from "./implementations/calculate";

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    // Register Phase 8 safe initial tools
    this.registerTool(getCurrentTimeTool);
    this.registerTool(calculateTool);
  }

  /**
   * Registers a new tool with the authoritative backend registry.
   */
  public registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting registered tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Retrieves a tool by exact name.
   */
  public getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Returns a list of all registered tools with risk levels and descriptions.
   */
  public listTools(): ToolSummary[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      riskLevel: t.riskLevel,
    }));
  }

  /**
   * Verifies if a tool is registered and permitted under the active allowlist.
   */
  public isToolAllowed(toolName: string, allowedTools?: string[]): boolean {
    if (!this.tools.has(toolName)) {
      return false;
    }
    if (!allowedTools || allowedTools.length === 0) {
      return true; // Default: all registered tools in default suite allowed
    }
    return allowedTools.includes(toolName);
  }

  /**
   * Generates OpenAI-compatible tool schemas for the LLM prompt.
   */
  public getOpenAIToolDefinitions(
    allowedTools?: string[]
  ): OpenAI.Chat.Completions.ChatCompletionTool[] {
    const list = this.listTools().filter((t) => this.isToolAllowed(t.name, allowedTools));

    return list.map((t) => {
      const toolInstance = this.tools.get(t.name)!;

      // Provide parameter schema
      let properties: Record<string, unknown> = {};
      let required: string[] = [];

      if (t.name === "get_current_time") {
        properties = {
          timezone: {
            type: "string",
            description: "IANA timezone identifier, e.g. 'Asia/Kolkata', 'UTC', 'America/New_York'",
            default: "UTC",
          },
        };
      } else if (t.name === "calculate") {
        properties = {
          expression: {
            type: "string",
            description: "Mathematical expression to evaluate, e.g. '45 * 12 + 10' or '(1200 / 4) * 1.15'",
          },
        };
        required = ["expression"];
      }

      return {
        type: "function" as const,
        function: {
          name: t.name,
          description: toolInstance.description,
          parameters: {
            type: "object",
            properties,
            required,
          },
        },
      };
    });
  }

  /**
   * Validates arguments, checks permissions, executes the tool with a timeout,
   * and normalizes the observation envelope.
   */
  public async executeTool(
    toolName: string,
    rawArguments: Record<string, unknown>,
    context: ToolContext,
    options?: { timeoutMs?: number; allowedTools?: string[] }
  ): Promise<ToolExecutionEnvelope> {
    const timeoutMs = options?.timeoutMs ?? 10000;

    // 1. Tool Existence Check
    const tool = this.getTool(toolName);
    if (!tool) {
      return {
        tool: toolName,
        success: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Tool '${toolName}' is not registered in the platform registry.`,
        },
      };
    }

    // 2. Authorization & Allowlist Check
    if (!this.isToolAllowed(toolName, options?.allowedTools)) {
      return {
        tool: toolName,
        success: false,
        error: {
          code: "TOOL_NOT_ALLOWED",
          message: `Tool '${toolName}' is not permitted under the active execution policy.`,
        },
      };
    }

    // 3. Argument Validation via Zod inputSchema
    const parseResult = tool.inputSchema.safeParse(rawArguments);
    if (!parseResult.success) {
      const details = parseResult.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      return {
        tool: toolName,
        success: false,
        error: {
          code: "TOOL_ARGUMENT_INVALID",
          message: `Invalid arguments for tool '${toolName}': ${details}`,
        },
      };
    }

    // 4. Execution with Bounded Timeout
    try {
      const executePromise = tool.execute(parseResult.data, context);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool execution timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const rawResult = await Promise.race([executePromise, timeoutPromise]);

      // 5. Output Validation via Zod outputSchema
      const outputResult = tool.outputSchema.safeParse(rawResult);
      if (!outputResult.success) {
        return {
          tool: toolName,
          success: false,
          error: {
            code: "TOOL_RESULT_INVALID",
            message: `Tool '${toolName}' produced output that failed schema validation.`,
          },
        };
      }

      return {
        tool: toolName,
        success: true,
        data: outputResult.data,
      };
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.message.includes("timed out");
      return {
        tool: toolName,
        success: false,
        error: {
          code: isTimeout ? "TOOL_TIMEOUT" : "TOOL_EXECUTION_FAILED",
          message: err instanceof Error ? err.message : "Unexpected tool execution error",
        },
      };
    }
  }
}

// Global Singleton Registry
export const toolRegistry = new ToolRegistry();
