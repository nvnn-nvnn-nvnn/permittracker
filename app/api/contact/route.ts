import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Read the provider key from the environment (server-only). Falls back across
// the var names that may exist so it works without further env edits.
const ACCESS_KEY =
  process.env.WEB3FORMS_ACCESS_KEY ??
  process.env.WEB3FORMS_PUBLIC_KEY ??
  process.env.NEXT_PUBLIC_WEB3FORMS_KEY;

const ENDPOINT =
  process.env.WEB3FORMS_ENDPOINT ?? "https://api.web3forms.com/submit";

export async function POST(req: Request): Promise<Response> {
  let body: {
    name?: string;
    email?: string;
    message?: string;
    botcheck?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  // Honeypot: a filled botcheck means a bot — accept silently, send nothing.
  if (body.botcheck) return NextResponse.json({ ok: true });

  const name = body.name?.trim();
  const email = body.email?.trim();
  const message = body.message?.trim();
  if (!name || !email || !message) {
    return NextResponse.json(
      { ok: false, error: "Please fill in your name, email, and message." },
      { status: 400 },
    );
  }

  if (!ACCESS_KEY) {
    return NextResponse.json(
      { ok: false, error: "The contact form isn't configured yet." },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        access_key: ACCESS_KEY,
        subject: "New CartLedger contact message",
        from_name: "CartLedger website",
        name,
        email,
        message,
      }),
    });
    const data = await res.json();
    if (data.success) return NextResponse.json({ ok: true });
    return NextResponse.json(
      { ok: false, error: data.message ?? "Submission failed." },
      { status: 502 },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Couldn't reach the mail service." },
      { status: 502 },
    );
  }
}
