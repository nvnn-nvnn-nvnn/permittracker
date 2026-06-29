import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAccountContext } from "@/lib/auth/session";
import { exchangeCode, saveSquareTokens } from "@/lib/square/oauth";

/** Square OAuth redirect target: verify state, exchange code, store tokens. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const saved = jar.get("sq_oauth_state")?.value;
  jar.delete("sq_oauth_state");

  const account = await getAccountContext();
  if (!account) return NextResponse.redirect(new URL("/login", url));
  if (!code || !state || !saved || state !== saved) {
    return NextResponse.redirect(new URL("/operations?square=error", url));
  }

  try {
    const tokens = await exchangeCode(code);
    await saveSquareTokens(account.accountId, account.userId, tokens);
  } catch {
    return NextResponse.redirect(new URL("/operations?square=error", url));
  }

  // Connected — send them to map locations → trucks.
  return NextResponse.redirect(new URL("/operations/square?connected=1", url));
}
