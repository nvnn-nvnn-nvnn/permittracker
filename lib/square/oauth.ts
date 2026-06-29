import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { squareOauth } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret";

/**
 * Square OAuth (live per-merchant connect). Raw REST + fetch (no SDK). Tokens
 * are stored encrypted per account in `square_oauth`. Configured only when the
 * Developer-app creds + an encryption secret are present.
 */
const SCOPES = [
  "MERCHANT_PROFILE_READ",
  "ORDERS_READ",
  "PAYMENTS_READ",
  "ITEMS_READ",
].join(" ");

const SQUARE_VERSION = "2025-01-23";

function oauthBase(): "sandbox" | "production" {
  return serverEnv().SQUARE_ENVIRONMENT;
}
function rootUrl(): string {
  return oauthBase() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}
function redirectUri(): string {
  return `${serverEnv().APP_URL}/api/square/callback`;
}

export function isSquareOAuthConfigured(): boolean {
  const env = serverEnv();
  return Boolean(
    env.SQUARE_CLIENT_ID && env.SQUARE_CLIENT_SECRET && env.SQUARE_TOKEN_SECRET,
  );
}

/** Square's authorize URL to redirect the merchant to. `state` is CSRF. */
export function squareAuthorizeUrl(state: string): string {
  const env = serverEnv();
  const params = new URLSearchParams({
    client_id: env.SQUARE_CLIENT_ID ?? "",
    scope: SCOPES,
    session: "false",
    state,
    redirect_uri: redirectUri(),
  });
  return `${rootUrl()}/oauth2/authorize?${params.toString()}`;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  merchantId: string | null;
}

async function tokenRequest(
  body: Record<string, string>,
): Promise<TokenResponse> {
  const env = serverEnv();
  const res = await fetch(`${rootUrl()}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    body: JSON.stringify({
      client_id: env.SQUARE_CLIENT_ID,
      client_secret: env.SQUARE_CLIENT_SECRET,
      ...body,
    }),
  });
  if (!res.ok) {
    throw new Error(`Square OAuth token ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_at?: string;
    merchant_id?: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_at ? new Date(json.expires_at) : null,
    merchantId: json.merchant_id ?? null,
  };
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
  });
}

function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Persist (encrypted) tokens for an account, upserting the single row. */
export async function saveSquareTokens(
  accountId: string,
  userId: string | null,
  t: TokenResponse,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(squareOauth)
    .values({
      accountId,
      merchantId: t.merchantId,
      environment: oauthBase(),
      accessTokenEnc: encryptSecret(t.accessToken),
      refreshTokenEnc: t.refreshToken ? encryptSecret(t.refreshToken) : null,
      expiresAt: t.expiresAt,
      scopes: SCOPES,
      connectedByUserId: userId,
    })
    .onConflictDoUpdate({
      target: squareOauth.accountId,
      set: {
        merchantId: t.merchantId,
        environment: oauthBase(),
        accessTokenEnc: encryptSecret(t.accessToken),
        refreshTokenEnc: t.refreshToken
          ? encryptSecret(t.refreshToken)
          : null,
        expiresAt: t.expiresAt,
        updatedAt: now,
      },
    });
}

export interface LiveSquareToken {
  accessToken: string;
  environment: "sandbox" | "production";
  merchantId: string | null;
}

/**
 * The account's live access token, refreshing it if it expires within 7 days.
 * Returns null if the account has not connected Square via OAuth.
 */
export async function getFreshSquareToken(
  accountId: string,
): Promise<LiveSquareToken | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(squareOauth)
    .where(eq(squareOauth.accountId, accountId))
    .limit(1);
  if (!row) return null;

  const environment = row.environment === "production" ? "production" : "sandbox";
  let accessToken = decryptSecret(row.accessTokenEnc);

  const soon = Date.now() + 7 * 86_400_000;
  if (row.refreshTokenEnc && row.expiresAt && row.expiresAt.getTime() < soon) {
    try {
      const refreshed = await refreshTokens(decryptSecret(row.refreshTokenEnc));
      await saveSquareTokens(accountId, row.connectedByUserId, refreshed);
      accessToken = refreshed.accessToken;
    } catch {
      // Refresh failed (revoked/expired) — caller treats current token as best
      // effort; a re-connect will be needed if it's truly dead.
    }
  }
  return { accessToken, environment, merchantId: row.merchantId };
}

/** Whether this account has connected Square via OAuth. */
export async function getSquareOauthStatus(
  accountId: string,
): Promise<{ connected: boolean; merchantId: string | null }> {
  const [row] = await getDb()
    .select({ merchantId: squareOauth.merchantId })
    .from(squareOauth)
    .where(eq(squareOauth.accountId, accountId))
    .limit(1);
  return { connected: Boolean(row), merchantId: row?.merchantId ?? null };
}

/** Remove the OAuth connection (disconnect). */
export async function deleteSquareOauth(accountId: string): Promise<void> {
  await getDb()
    .delete(squareOauth)
    .where(eq(squareOauth.accountId, accountId));
}
