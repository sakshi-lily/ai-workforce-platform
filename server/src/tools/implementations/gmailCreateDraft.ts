import { z } from "zod";
import { Tool, ToolContext } from "../types";
import { gmailService } from "../../integrations/gmail/gmailService";
import { GMAIL_BOUNDS } from "../../integrations/gmail/gmailTypes";

const inputSchema = z.object({
  to: z
    .array(z.string().email("Invalid recipient email address."))
    .min(1, "At least one recipient is required.")
    .max(GMAIL_BOUNDS.MAX_DRAFT_RECIPIENTS, `Cannot exceed ${GMAIL_BOUNDS.MAX_DRAFT_RECIPIENTS} recipients.`),
  subject: z
    .string()
    .min(1, "Subject is required.")
    .max(GMAIL_BOUNDS.MAX_SUBJECT_CHARS, `Subject cannot exceed ${GMAIL_BOUNDS.MAX_SUBJECT_CHARS} characters.`),
  body: z
    .string()
    .min(1, "Draft body is required.")
    .max(GMAIL_BOUNDS.MAX_EMAIL_BODY_CHARS, `Body cannot exceed ${GMAIL_BOUNDS.MAX_EMAIL_BODY_CHARS} characters.`),
});

const outputSchema = z.object({
  draftId: z.string(),
  messageId: z.string().optional(),
  to: z.array(z.string()),
  subject: z.string(),
  status: z.literal("DRAFT_CREATED"),
  createdAt: z.string(),
  userNotice: z.string(),
});

export const gmailCreateDraftTool: Tool<
  z.infer<typeof inputSchema>,
  z.infer<typeof outputSchema>
> = {
  name: "gmail_create_draft",
  description:
    "Creates an email draft in the connected Gmail account for review. Controlled mutation — does NOT send external email.",
  riskLevel: "MUTATING",
  inputSchema,
  outputSchema,
  execute: async (input, context: ToolContext) => {
    const result = await gmailService.createDraft(input, context);

    return {
      draftId: result.draftId,
      messageId: result.messageId,
      to: result.to,
      subject: result.subject,
      status: "DRAFT_CREATED",
      createdAt: result.createdAt,
      userNotice: "Draft saved in Gmail mailbox. Email was NOT sent.",
    };
  },
};
