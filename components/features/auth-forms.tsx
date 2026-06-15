"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  signInWithPassword,
  signUpWithPassword,
  signInWithMagicLink,
  requestPasswordReset,
  resetPassword,
  type AuthActionState,
} from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

const initial: AuthActionState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

function ErrorText({ state }: { state: AuthActionState }) {
  if (!state.error) return null;
  return (
    <p
      role="alert"
      className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {state.error}
    </p>
  );
}

export function PasswordSignInForm() {
  const [state, action] = useActionState(signInWithPassword, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email ?? ""}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          required
          autoComplete="current-password"
        />
      </div>
      <ErrorText state={state} />
      <SubmitButton label="Sign in" />
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUpWithPassword, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          defaultValue={state.fullName ?? ""}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email ?? ""}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          required
          autoComplete="new-password"
          minLength={8}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <PasswordInput
          id="confirm-password"
          name="confirm"
          required
          autoComplete="new-password"
          minLength={8}
        />
      </div>
      <ErrorText state={state} />
      <SubmitButton label="Create account" />
    </form>
  );
}

export function MagicLinkForm() {
  const [state, action] = useActionState(signInWithMagicLink, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="magic-email">Email</Label>
        <Input
          id="magic-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@foodtruck.com"
          defaultValue={state.email ?? ""}
        />
      </div>
      <ErrorText state={state} />
      <SubmitButton label="Email me a magic link" />
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initial);
  if (state.ok) {
    return (
      <div className="rounded-md bg-muted px-3 py-3 text-sm">
        If an account exists for <strong>{state.email}</strong>, a reset link is
        on its way. Check your inbox (and spam).
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email ?? ""}
        />
      </div>
      <ErrorText state={state} />
      <SubmitButton label="Send reset link" />
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPassword, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="new-password">New password</Label>
        <PasswordInput
          id="new-password"
          name="password"
          required
          autoComplete="new-password"
          minLength={8}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <PasswordInput
          id="confirm-password"
          name="confirm"
          required
          autoComplete="new-password"
          minLength={8}
        />
      </div>
      <ErrorText state={state} />
      <SubmitButton label="Update password" />
    </form>
  );
}
