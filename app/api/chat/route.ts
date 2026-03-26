import Anthropic from "@anthropic-ai/sdk";
import type { BetaRequestMCPServerURLDefinition, BetaTextBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
    }

    const MIXPANEL_MCP_URL = process.env.MIXPANEL_MCP_URL || "https://mcp.mixpanel.com/sse";
    const MIXPANEL_SERVICE_ACCOUNT = process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME || "";
    const MIXPANEL_SECRET = process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET || "";
    const MIXPANEL_PROJECT_ID = process.env.MIXPANEL_PROJECT_ID || "";

    const SYSTEM_PROMPT = `You are a data analyst assistant for the Jobify team. You answer questions about Mixpanel analytics data.

## Default behavior
- Always filter for **Israel traffic only** unless the user explicitly requests a different country.
- Use the Mixpanel MCP tools to fetch real data — never guess or fabricate numbers.
- Keep answers concise and clear.

## Core event mappings
- **Visitors / Unique Users**: event = \`$mp_web_page_view\` (count unique users, not total events)
- **Signups**: event = \`registration complete\`
- **Employment Profile**: event = \`ai_finished_analyze\` (first occurrence per user only)
- **Jobs Feed**: event = \`myrolesjob_page_reached\`
- **Roles Feed**: event = \`myjob_page_reached\`
- **Job View**: event = \`job_page_desc_clicked\`
- **Direct Apply**: event = \`employer_ats_applied\`
- **External Apply**: event = \`job_external_link_clicked\`
- **Total Applications**: sum of \`employer_ats_applied\` + \`job_external_link_clicked\`

## Rules
1. If the user's question refers to an **unclear metric** (you're not sure what to query), ask a clarifying question before querying Mixpanel.
2. If the user mentions an event name or metric you don't recognize and it's not in the core mappings above, respond with exactly:
   "I'm not sure which event you mean. If you don't know, please ask Amit."
   After the user or Amit clarifies, use the correct event going forward in the conversation.
3. Respond in the **same language** the user writes in (Hebrew or English).
4. When presenting numbers, use clear formatting (e.g., "1,234 unique users").
5. For "Employment Profile" counts, note it tracks first-time users only.
6. When querying Mixpanel, always apply the Israel country filter using \`$country_code = "IL"\` or equivalent.

## Mixpanel project context
- Project ID: ${MIXPANEL_PROJECT_ID}
- Default country filter: Israel (\`$country_code = "IL"\`)
`;

    const client = new Anthropic({ apiKey });

    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: "Invalid messages format" }, { status: 400 });
    }

    const anthropicMessages: Anthropic.MessageParam[] = messages.map(
      (m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })
    );

    let reply: string;

    if (MIXPANEL_SERVICE_ACCOUNT && MIXPANEL_SECRET) {
      // Use beta messages API with MCP server
      const credentials = Buffer.from(
        `${MIXPANEL_SERVICE_ACCOUNT}:${MIXPANEL_SECRET}`
      ).toString("base64");

      const mcpServer: BetaRequestMCPServerURLDefinition = {
        type: "url",
        name: "mixpanel",
        url: MIXPANEL_MCP_URL,
        authorization_token: `Basic ${credentials}`,
      };

      const response = await client.beta.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: anthropicMessages,
        mcp_servers: [mcpServer],
        betas: ["mcp-client-2025-04-04"],
      });

      const textBlocks = response.content.filter(
        (b): b is BetaTextBlock => b.type === "text"
      );
      reply = textBlocks.map((b) => b.text).join("\n");
    } else {
      // Fallback: no MCP, inform user to configure credentials
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system:
          SYSTEM_PROMPT +
          "\n\nIMPORTANT: Mixpanel MCP credentials are not configured. You cannot query real data. " +
          "Inform the user that MIXPANEL_SERVICE_ACCOUNT_USERNAME and MIXPANEL_SERVICE_ACCOUNT_SECRET " +
          "environment variables must be set to query live data.",
        messages: anthropicMessages,
      });

      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      reply = textBlocks.map((b) => b.text).join("\n");
    }

    return Response.json({ reply });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
