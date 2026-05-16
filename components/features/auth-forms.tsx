"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  signInWithPassword,
  signUpWithPassword,
  signInWithMagicLink,
  type AuthActionState,
} from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
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
        <Input id="fullName" name="fullName" type="text" autoComplete="name" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
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
        />
      </div>
      <ErrorText state={state} />
      <SubmitButton label="Email me a magic link" />
    </form>
  );
}
