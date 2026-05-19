import { requireAccountContext } from "@/lib/auth/session";
import { digestsForAccount } from "@/lib/digest/resolve";
import { currentPeriod, periodLabel } from "@/lib/digest/period";
import { DigestContent } from "@/components/features/digest-content";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Inspection prep · PermitKeep" };
export const dynamic = "force-dynamic";

export default async function DigestPage() {
  const ctx = await requireAccountContext();
  const period = currentPeriod();
  const digests = await digestsForAccount(ctx.accountId, period);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Inspection prep
        </h1>
        <p className="text-sm text-muted-foreground">
          {periodLabel(period)} · tailored to your jurisdictions
        </p>
      </div>

      {digests.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No digest for your area yet. It&apos;s generated monthly per
            jurisdiction — add a truck or item with a jurisdiction, or check
            back after the next run.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {digests.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle className="text-base">{d.title}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {d.jurisdiction}
                </p>
              </CardHeader>
              <CardContent>
                <DigestContent markdown={d.contentMarkdown} />
              </CardContent>
            </Card>
          ))}
          <p className="px-1 text-xs text-muted-foreground">
            General guidance for your area — not legal advice. Always confirm
            requirements with your jurisdiction.
          </p>
        </div>
      )}
    </div>
  );
}
