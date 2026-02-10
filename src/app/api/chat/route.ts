import { NextRequest, NextResponse } from "next/server";

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || "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";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const CONVEX_URL = "https://hardy-mongoose-695.eu-west-1.convex.site";

// Simple in-memory rate limiter
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(token: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(token);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(token, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

const SYSTEM_PROMPT = `You are Orián, a friendly and efficient AI support agent for a web development studio. Your job is to help clients report issues, request changes, and provide feedback about their websites.

## How you behave:
- Be warm, professional, and concise
- Greet the client on first message
- Help them clearly describe what they need
- You know their current page URL (provided as context)

## Collecting ticket info:
When a client describes an issue or request, gather:
1. **Type**: Is this a bug report, a change request, or general feedback?
2. **Title**: A short summary (you can suggest one)
3. **Description**: Clear details of what they need
4. **Priority**: How urgent? (low/medium/high) — ask if unclear

Once you have enough info, tell the client you'll create a ticket and output a JSON block like this on its own line:
\`\`\`json
{"action":"create_ticket","title":"...","description":"...","type":"bug|change_request|feedback","priority":"low|medium|high"}
\`\`\`

## Other capabilities:
- If the client asks about their tickets or status, tell them to check the "My Tickets" tab
- If asked about something outside your scope, politely redirect
- Keep responses short — 2-3 sentences max unless more detail is needed
- You can use emoji sparingly for friendliness

## Important:
- Only create a ticket when you have a clear title, description, and type
- Don't create duplicate tickets — ask if they want to add to an existing one
- The pageUrl context tells you which page they're on — reference it naturally`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, siteId, pageUrl, token } = body;

    if (!messages || !token) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!checkRateLimit(token)) {
      return NextResponse.json({ error: "Rate limited. Try again in a minute." }, { status: 429 });
    }

    const systemMessage = {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\nContext — Site ID: ${siteId || "unknown"}, Current page: ${pageUrl || "unknown"}`,
    };

    // Try models in order
    const models = [
      "moonshotai/kimi-k2-instruct",
      "nvidia/llama-3.1-nemotron-ultra-253b-v1",
      "meta/llama-3.1-70b-instruct",
    ];

    let aiResponse = null;
    let lastError = "";

    for (const model of models) {
      try {
        const res = await fetch(NVIDIA_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${NVIDIA_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [systemMessage, ...messages],
            temperature: 0.7,
            max_tokens: 1024,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          aiResponse = data.choices?.[0]?.message?.content || "I'm having trouble responding right now. Please try again.";
          break;
        } else {
          lastError = `${model}: ${res.status}`;
        }
      } catch (e: any) {
        lastError = `${model}: ${e.message}`;
      }
    }

    if (!aiResponse) {
      return NextResponse.json({ error: `AI unavailable: ${lastError}` }, { status: 502 });
    }

    // Check if AI wants to create a ticket
    let ticketCreated = null;
    const jsonMatch = aiResponse.match(/```json\s*(\{[^`]+\})\s*```/);
    if (jsonMatch) {
      try {
        const ticketData = JSON.parse(jsonMatch[1]);
        if (ticketData.action === "create_ticket") {
          const ticketRes = await fetch(`${CONVEX_URL}/api/tickets`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-OC-Token": token },
            body: JSON.stringify({
              title: ticketData.title,
              description: ticketData.description,
              type: ticketData.type,
              priority: ticketData.priority || "medium",
              pageUrl,
            }),
          });
          if (ticketRes.ok) {
            const result = await ticketRes.json();
            ticketCreated = { id: result.id, title: ticketData.title };
          }
        }
      } catch { /* parsing failed, ignore */ }

      // Clean the JSON block from the response shown to user
      aiResponse = aiResponse.replace(/```json\s*\{[^`]+\}\s*```/g, "").trim();
      if (ticketCreated) {
        aiResponse += `\n\n✅ Ticket created: **${ticketCreated.title}**\nYou can track it in the "My Tickets" tab.`;
      }
    }

    return NextResponse.json({ message: aiResponse, ticketCreated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
