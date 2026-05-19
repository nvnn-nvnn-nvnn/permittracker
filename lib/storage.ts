import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, requireEnv } from "@/lib/env";
import { DOCUMENTS_BUCKET } from "@/lib/constants";

export { DOCUMENTS_BUCKET };

/**
 * Service-role Supabase client. Server-only. Bypasses RLS by design — the
 * bucket is private and we only ever expose short-lived SIGNED urls.
 */
function admin() {
  return createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

/** Canonical object path: accounts/{account}/items/{item}/{file}-{name}. */
export function buildStoragePath(args: {
  accountId: string;
  complianceItemId: string | null;
  fileId: string;
  originalFilename: string;
}): string {
  const safe = args.originalFilename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-80);
  const itemSeg = args.complianceItemId ?? "unassigned";
  return `accounts/${args.accountId}/items/${itemSeg}/${args.fileId}-${safe}`;
}

/** A one-time signed URL the browser uses to PUT the file bytes directly. */
export async function createSignedUploadUrl(path: string) {
  const { data, error } = await admin()
    .storage.from(DOCUMENTS_BUCKET)
    .createSignedUploadUrl(path);
  if (error) throw error;
  return data; // { signedUrl, token, path }
}

/** Short-lived signed URL for viewing/downloading a stored document. */
export async function createSignedReadUrl(path: string, expiresSec = 600) {
  const { data, error } = await admin()
    .storage.from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresSec);
  if (error) throw error;
  return data.signedUrl;
}

/** Upload bytes server-side (used by inbound email → unassigned files). */
export async function uploadBytes(
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await admin()
    .storage.from(DOCUMENTS_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;
}

/** Download bytes server-side (used by the extraction job). */
export async function downloadBytes(
  path: string,
): Promise<{ base64: string; contentType: string }> {
  const { data, error } = await admin()
    .storage.from(DOCUMENTS_BUCKET)
    .download(path);
  if (error || !data) throw error ?? new Error("Download failed");
  const buf = Buffer.from(await data.arrayBuffer());
  return {
    base64: buf.toString("base64"),
    contentType: data.type || "application/octet-stream",
  };
}
