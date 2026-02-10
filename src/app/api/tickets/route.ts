import { NextRequest, NextResponse } from "next/server";

const CONVEX_URL = "https://hardy-mongoose-695.eu-west-1.convex.site";
const AGENT_SECRET = process.env.OC_AGENT_SECRET || "RdpEfmu28YHFBt-eyyNQ-EvdfaLby7zXnkLtK2BEjnk";

export async function GET() {
  try {
    const res = await fetch(`${CONVEX_URL}/api/agent/tickets/all`, {
      headers: { Authorization: `Bearer ${AGENT_SECRET}` },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${CONVEX_URL}/api/tickets`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGENT_SECRET}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
