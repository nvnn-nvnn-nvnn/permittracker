"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Status = "idle" | "sending" | "success" | "error";

/** Contact form. Posts same-origin to /api/contact, which forwards to the
 *  email provider server-side (keeps the provider key off the client). */
export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setStatus("sending");
    setErrorMsg(null);

    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") ?? ""),
      email: String(data.get("email") ?? ""),
      message: String(data.get("message") ?? ""),
      botcheck: data.get("botcheck") ? true : false,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setStatus("success");
        form.reset();
      } else {
        setStatus("error");
        setErrorMsg(json.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Couldn't reach the server. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-status-green/40 bg-status-green/5 p-6 text-sm">
        <p className="font-semibold text-status-green">
          Thanks for reaching out!
        </p>
        <p className="mt-1 text-muted-foreground">
          Your message is on its way — we&apos;ll get back to you within one
          business day.
        </p>
      </div>
    );
  }

  const sending = status === "sending";

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6"
    >
      {/* Honeypot — bots fill this; real users never see it. */}
      <input
        type="checkbox"
        name="botcheck"
        className="hidden"
        style={{ display: "none" }}
        tabIndex={-1}
        autoComplete="off"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="c-name">Name</Label>
          <Input
            id="c-name"
            name="name"
            required
            placeholder="Jane Operator"
            disabled={sending}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="c-email">Email</Label>
          <Input
            id="c-email"
            name="email"
            type="email"
            required
            placeholder="jane@truck.com"
            disabled={sending}
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
          disabled={sending}
        />
      </div>

      {status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {errorMsg}
        </p>
      )}

      <Button type="submit" className="self-start" disabled={sending}>
        {sending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
