"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "./server";

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

export interface AuthActionState {
  error?: string;
  /** Echoed back so the form can repopulate the email field after a failed submit. */
  email?: string;
  fullName?: string;
  /** Set after a successful reset-password request so the form can show a confirmation. */
  ok?: boolean;
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

/** Email + password sign-in. */
export async function signInWithPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const rawEmail = String(formData.get("email") ?? "");
  const email = emailSchema.safeParse(rawEmail);
  const password = z.string().min(1).safeParse(formData.get("password"));
  if (!email.success || !password.success) {
    return { error: "Enter a valid email and password.", email: rawEmail };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  });
  if (error) return { error: error.message, email: rawEmail };
  redirect("/dashboard");
}

/** Email + password sign-up. Sends a confirmation email. */
export async function signUpWithPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const rawEmail = String(formData.get("email") ?? "");
  const rawFullName = String(formData.get("fullName") ?? "");
  const email = emailSchema.safeParse(rawEmail);
  const password = passwordSchema.safeParse(formData.get("password"));
  const confirm = z.string().safeParse(formData.get("confirm"));
  const fullName = z.string().trim().min(1).safeParse(rawFullName);
  if (!email.success) {
    return { error: "Enter a valid email.", email: rawEmail, fullName: rawFullName };
  }
  if (!password.success) {
    return {
      error: password.error.issues[0]?.message ?? "Invalid password.",
      email: rawEmail,
      fullName: rawFullName,
    };
  }
  if (!confirm.success || confirm.data !== password.data) {
    return { error: "Passwords do not match.", email: rawEmail, fullName: rawFullName };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback?next=/dashboard`,
      data: fullName.success ? { full_name: fullName.data } : undefined,
    },
  });
  if (error) return { error: error.message, email: rawEmail, fullName: rawFullName };
  redirect("/check-email?reason=confirm");
}

/** Passwordless magic-link sign-in. */
export async function signInWithMagicLink(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const rawEmail = String(formData.get("email") ?? "");
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) return { error: "Enter a valid email.", email: rawEmail };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback?next=/dashboard`,
    },
  });
  if (error) return { error: error.message, email: rawEmail };
  redirect("/check-email?reason=magic");
}

/**
 * Send a password-reset email. The link lands on /auth/callback which
 * exchanges the code for a session, then forwards to /reset-password where
 * the user picks a new password.
 *
 * Always returns ok=true even on Supabase error: leaking whether an email is
 * registered would enable account enumeration. We surface the email back so
 * the form can confirm "we sent a link to X."
 */
export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const rawEmail = String(formData.get("email") ?? "");
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) return { error: "Enter a valid email.", email: rawEmail };
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password`,
  });
  return { ok: true, email: email.data };
}

/**
 * Set a new password. Requires an active session — established by the
 * recovery link landing on /auth/callback first.
 */
export async function resetPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = passwordSchema.safeParse(formData.get("password"));
  const confirm = z.string().safeParse(formData.get("confirm"));
  if (!password.success) {
    return { error: password.error.issues[0]?.message ?? "Invalid password." };
  }
  if (!confirm.success || confirm.data !== password.data) {
    return { error: "Passwords do not match." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
