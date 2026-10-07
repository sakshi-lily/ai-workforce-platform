import { z } from "zod";
import { Tool, ToolContext } from "../types";
import { gmailService } from "../../integrations/gmail/gmailService";
import { formatUntrustedSearchResults } from "../../integrations/gmail/gmailMapper";
import { GMAIL_BOUNDS } from "../../integrations/gmail/gmailTypes";

const inputSchema = z.object({
  query: z
    .string()
    .max(GMAIL_BOUNDS.MAX_QUERY_LENGTH, `Query must not exceed ${GMAIL_BOUNDS.MAX_QUERY_LENGTH} characters.`)
    .default(""),
  maxResults: z
    .number()
    .min(1)
    .max(GMAIL_BOUNDS.MAX_SEARCH_RESULTS)
    .default(GMAIL_BOUNDS.DEFAULT_SEARCH_RESULTS),
});

const outputSchema = z.object({
  count: z.number(),
  summaries: z.array(
    z.object({
      messageId: z.string(),
      threadId: z.string(),
      from: z.string(),
      to: z.array(z.string()),
      subject: z.string(),
      snippet: z.string(),
      receivedAt: z.string(),
    })
  ),
  untrustedFormattedSearch: z.string(),
});

export const gmailSearchTool: Tool<
  z.infer<typeof inputSchema>,
  z.infer<typeof outputSchema>
> = {
  name: "gmail_search",
  description:
    "Searches authorized messages in the connected Gmail account using query keywords or senders.",
  riskLevel: "READ_ONLY",
  inputSchema,
  outputSchema,
  execute: async (input, context: ToolContext) => {
    const summaries = await gmailService.searchMessages(
      input.query,
      input.maxResults,
      context
    );

    return {
      count: summaries.length,
      summaries,
      untrustedFormattedSearch: formatUntrustedSearchResults(summaries),
    };
  },
};
