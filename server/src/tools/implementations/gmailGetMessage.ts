import { z } from "zod";
import { Tool, ToolContext } from "../types";
import { gmailService } from "../../integrations/gmail/gmailService";
import { formatUntrustedEmailObservation } from "../../integrations/gmail/gmailMapper";

const inputSchema = z.object({
  messageId: z.string().min(1, "Message ID is required."),
});

const outputSchema = z.object({
  messageId: z.string(),
  threadId: z.string(),
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string(),
  snippet: z.string(),
  receivedAt: z.string(),
  plainTextBody: z.string(),
  hasAttachments: z.boolean(),
  attachmentsSummary: z
    .array(
      z.object({
        filename: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number(),
      })
    )
    .optional(),
  untrustedObservation: z.string(),
});

export const gmailGetMessageTool: Tool<
  z.infer<typeof inputSchema>,
  z.infer<typeof outputSchema>
> = {
  name: "gmail_get_message",
  description:
    "Retrieves sanitized, plain-text email content and metadata for a specific message ID from the connected Gmail account.",
  riskLevel: "READ_ONLY",
  inputSchema,
  outputSchema,
  execute: async (input, context: ToolContext) => {
    const detail = await gmailService.getMessage(input.messageId, context);
    const untrustedObservation = formatUntrustedEmailObservation(detail);

    return {
      messageId: detail.messageId,
      threadId: detail.threadId,
      from: detail.from,
      to: detail.to,
      subject: detail.subject,
      snippet: detail.snippet,
      receivedAt: detail.receivedAt,
      plainTextBody: detail.plainTextBody,
      hasAttachments: detail.hasAttachments,
      attachmentsSummary: detail.attachmentsSummary,
      untrustedObservation,
    };
  },
};
