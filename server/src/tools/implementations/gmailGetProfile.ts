import { z } from "zod";
import { Tool, ToolContext } from "../types";
import { gmailService } from "../../integrations/gmail/gmailService";

const inputSchema = z.object({});

const outputSchema = z.object({
  email: z.string(),
  messagesTotal: z.number().optional(),
  threadsTotal: z.number().optional(),
});

export const gmailGetProfileTool: Tool<
  z.infer<typeof inputSchema>,
  z.infer<typeof outputSchema>
> = {
  name: "gmail_get_profile",
  description: "Verifies and retrieves profile details of the connected Gmail account.",
  riskLevel: "READ_ONLY",
  inputSchema,
  outputSchema,
  execute: async (_input, context: ToolContext) => {
    return await gmailService.getProfile(context);
  },
};
