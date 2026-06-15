"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function NotificationsPanel() {
  const utils = trpc.useUtils();
  const settings = trpc.account.notificationSettings.useQuery();
  const setPhone = trpc.account.setSmsPhone.useMutation();
  const simEmail = trpc.inbound.simulateEmail.useMutation();
  const simOk = trpc.inbound.simulateSmsOk.useMutation();
  const simVoice = trpc.inbound.simulateVoicePressOne.useMutation();
  const [phone, setPhone_] = useState<string | null>(null);
  const [subject, setSubject] = useState(
    "Your Mobile Food Unit License renewal",
  );
  const [body, setBody] = useState(
    "This notice is to inform you that permit MFU-2024-0917 issued by " +
      "the City Health Department expires on 2026-07-01. Please renew.",
  );
  const [msg, setMsg] = useState<string | null>(null);

  const phoneValue = phone ?? settings.data?.smsPhone ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications &amp; forward-to-inbox</CardTitle>
        <CardDescription>
          SMS reminders (Pro+, coming soon) and your unique email address
          for forwarding renewal notices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div>
          <Label className="text-muted-foreground">
            Forward renewal notices to
          </Label>
          <p className="mt-1 font-mono text-xs break-all">
            {settings.data?.inboundAddress ?? "…"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Anything emailed here is classified by Claude and matched to an
            item (or filed as a draft for review).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sms">SMS reminder number (E.164)</Label>
          <div className="flex gap-2">
            <Input
              id="sms"
              value={phoneValue}
              placeholder="+16125551234"
              onChange={(e) => setPhone_(e.target.value)}
              className="max-w-56"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={setPhone.isPending}
              onClick={async () => {
                setMsg(null);
                try {
                  await setPhone.mutateAsync({ phone: phoneValue.trim() });
                  await utils.account.notificationSettings.invalidate();
                  setMsg("Saved.");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Failed");
                }
              }}
            >
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            SMS sends only on Pro+ plans. Reply <strong>OK</strong> to a
            reminder text to acknowledge it.
          </p>
        </div>

        <div className="space-y-2 rounded-md border border-dashed p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Dev simulators (no Postmark/Twilio needed)
          </p>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={simEmail.isPending}
              onClick={async () => {
                setMsg(null);
                try {
                  const r = await simEmail.mutateAsync({ subject, body });
                  setMsg(
                    `Inbound processed: ${r.category} · ${
                      r.matched ? "matched existing item" : "created draft"
                    }${r.proposalId ? " · proposal filed" : ""}`,
                  );
                  await utils.item.list.invalidate();
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Failed");
                }
              }}
            >
              {simEmail.isPending ? "Sending…" : "Simulate inbound email"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={simOk.isPending}
              onClick={async () => {
                setMsg(null);
                try {
                  await simOk.mutateAsync();
                  setMsg("SMS reply OK → acknowledged most recent SMS reminder.");
                  await utils.reminder.invalidate();
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Failed");
                }
              }}
            >
              {simOk.isPending ? "…" : 'Simulate SMS "OK"'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={simVoice.isPending}
              onClick={async () => {
                setMsg(null);
                try {
                  await simVoice.mutateAsync();
                  setMsg(
                    "Voice press-1 → acknowledged most recent voice escalation.",
                  );
                  await utils.reminder.invalidate();
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Failed");
                }
              }}
            >
              {simVoice.isPending ? "…" : 'Simulate voice "press 1"'}
            </Button>
          </div>
        </div>

        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      </CardContent>
    </Card>
  );
}
