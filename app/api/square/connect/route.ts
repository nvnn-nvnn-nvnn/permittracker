import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getAccountContext } from "@/lib/auth/session";
import {
  isSquareOAuthConfigured,
  squareAuthorizeUrl,
} from "@/lib/square/oauth";

/** Start the Square OAuth flow: set a CSRF state cookie, redirect to Square. */
export async function GET(req: Request) {
  const base = new URL(req.url);
  const account = await getAccountContext();
  if (!account) return NextResponse.redirect(new URL("/login", base));
  if (!isSquareOAuthConfigured()) {
    return NextResponse.redirect(
      new URL("/operations?square=unconfigured", base),
    );
  }

  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("sq_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(squareAuthorizeUrl(state));
}
