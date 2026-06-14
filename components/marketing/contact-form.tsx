"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Placeholder contact form. Captures submit client-side and shows a notice —
 * not yet wired to a backend. Replace onSubmit with a server action + email
 * send before launch.
 */
export function ContactForm() {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="rounded-2xl border border-status-green/40 bg-status-green/5 p-6 text-sm">
        <p className="font-semibold text-status-green">Thanks for reaching out!</p>
        <p className="mt-1 text-muted-foreground">
          This form is a preview and isn&apos;t wired up yet — please email us
          directly at{" "}
          <a
            href="mailto:raysarchive@proton.me"
            className="font-medium text-primary hover:underline"
          >
            raysarchive@proton.me
          </a>{" "}
          and we&apos;ll get back to you.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="c-name">Name</Label>
          <Input id="c-name" name="name" required placeholder="Jane Operator" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="c-email">Email</Label>
          <Input
            id="c-email"
            name="email"
            type="email"
            required
            placeholder="jane@truck.com"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="c-message">How can we help?</Label>
        <Textarea
          id="c-message"
          name="message"
          required
          rows={5}
          placeholder="Tell us about your operation…"
        />
      </div>
      <Button type="submit" className="self-start">
        Send message
      </Button>
    </form>
  );
}
