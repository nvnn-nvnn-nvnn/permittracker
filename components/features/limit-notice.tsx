import Link from "next/link";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/**
 * Polished "you've hit your plan limit" prompt shown in place of a raw error
 * when a create is blocked by the truck/item cap. Offers a direct upgrade path.
 */
export function LimitNotice({ message }: { message: string }) {
  // Drop the server's "Upgrade in Settings → Billing…" tail — the button says it.
  const detail = message.replace(/\s*upgrade in settings.*$/i, "").trim();

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="size-4" />
        </span>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">You&apos;ve reached your plan limit</p>
          <p className="text-sm text-muted-foreground">
            {detail} Upgrade for more capacity, or archive something you no
            longer track to free up space.
          </p>
        </div>
      </div>
      <Link
        href="/settings"
        className={buttonVariants({ size: "sm", className: "shrink-0" })}
      >
        Upgrade plan
      </Link>
    </div>
  );
}
