"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "./server";

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

export interface AuthActionState {
  error?: string;
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

/** Email + password sign-in. */
export async function signInWithPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const password = z.string().min(1).safeParse(formData.get("password"));
  if (!email.success || !password.success) {
    return { error: "Enter a valid email and password." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

/** Email + password sign-up. Sends a confirmation email. */
export async function signUpWithPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = emailSchema.safeParse(formData.get("email"));
  const password = passwordSchema.safeParse(formData.get("password"));
  const fullName = z
    .string()
    .trim()
    .min(1)
    .safeParse(formData.get("fullName"));
  if (!email.success) {
    return { error: "Enter a valid email." };
  }
  if (!password.success) {
    return {
      error: password.error.issues[0]?.message ?? "Invalid password.",
    };
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
  if (error) return { error: error.message };
  redirect("/check-email?reason=confirm");
}

/** Passwordless magic-link sign-in. */
export async function signInWithMagicLink(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback?next=/dashboard`,
    },
  });
  if (error) return { error: error.message };
  redirect("/check-email?reason=magic");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
