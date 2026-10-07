import { z } from "zod";
import { Tool, ToolContext } from "../types";
import { gmailService } from "../../integrations/gmail/gmailService";
import { GMAIL_BOUNDS } from "../../integrations/gmail/gmailTypes";

const inputSchema = z.object({
  to: z
    .array(z.string().email("Invalid recipient email address."))
    .min(1, "At least one recipient is required.")
    .max(GMAIL_BOUNDS.MAX_DRAFT_RECIPIENTS),
  subject: z
    .string()
    .min(1, "Subject is required.")
    .max(GMAIL_BOUNDS.MAX_SUBJECT_CHARS),
  body: z
    .string()
    .min(1, "Body is required.")
    .max(GMAIL_BOUNDS.MAX_EMAIL_BODY_CHARS),
  reason: z.string().optional(),
});

const outputSchema = z.object({
  status: z.enum(["SENT", "APPROVAL_REQUIRED", "BLOCKED"]),
  approvalId: z.string().optional(),
  reason: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const gmailSendTool: Tool<
  z.infer<typeof inputSchema>,
  z.infer<typeof outputSchema>
> = {
  name: "gmail_send",
  description:
    "Proposes sending an external email via Gmail. EXTERNAL_SIDE_EFFECT risk: strictly intercepted and staged for Human Approval.",
  riskLevel: "EXTERNAL_SIDE_EFFECT",
  inputSchema,
  outputSchema,
  execute: async (input, context: ToolContext) => {
    // Under Phase 16 governance, autonomous external transmission is strictly halted at the approval boundary
    const result = await gmailService.stageSendForApproval(input, context);

    return {
      status: result.status,
      approvalId: result.approvalId,
      reason:
        result.reason ||
        "External email transmission has been staged for Human Approval. Transmission blocked pending Phase 17 review.",
      details: result.details,
    };
  },
};
