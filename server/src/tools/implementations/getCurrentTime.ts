import { z } from "zod";
import { Tool, ToolContext } from "../types";

export const GetCurrentTimeInputSchema = z.object({
  timezone: z
    .string()
    .optional()
    .default("UTC")
    .describe("IANA timezone identifier, e.g. 'Asia/Kolkata', 'UTC', 'America/New_York'"),
});

export type GetCurrentTimeInput = z.infer<typeof GetCurrentTimeInputSchema>;

export const GetCurrentTimeOutputSchema = z.object({
  time: z.string().datetime({ offset: true }),
  timezone: z.string(),
  formatted: z.string(),
});

export type GetCurrentTimeOutput = z.infer<typeof GetCurrentTimeOutputSchema>;

export const getCurrentTimeTool: Tool<GetCurrentTimeInput, GetCurrentTimeOutput> = {
  name: "get_current_time",
  description: "Returns the authoritative current server time and date formatted for the specified IANA timezone (e.g. 'Asia/Kolkata', 'UTC', 'America/New_York').",
  riskLevel: "READ_ONLY",
  inputSchema: GetCurrentTimeInputSchema,
  outputSchema: GetCurrentTimeOutputSchema,

  async execute(input: GetCurrentTimeInput, _context: ToolContext): Promise<GetCurrentTimeOutput> {
    const tz = input.timezone || "UTC";

    // Validate timezone validity using standard Intl
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    } catch {
      throw new Error(`Invalid IANA timezone identifier: '${tz}'. Valid examples: 'Asia/Kolkata', 'UTC', 'America/New_York'.`);
    }

    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      dateStyle: "full",
      timeStyle: "long",
    });

    return {
      time: now.toISOString(),
      timezone: tz,
      formatted: formatter.format(now),
    };
  },
};
