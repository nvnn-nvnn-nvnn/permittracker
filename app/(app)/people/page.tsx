import Link from "next/link";
import { serverApi } from "@/lib/trpc/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "People · CartLedger" };
export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const api = await serverApi();
  const people = await api.person.list();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <Link href="/people/new" className={buttonVariants({ size: "sm" })}>
          Add person
        </Link>
      </div>

      {people.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No people yet</CardTitle>
            <CardDescription>
              Add staff; their certifications cascade to the active trucks
              they&apos;re assigned to.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {people.map((p) => (
            <Link key={p.id} href={`/people/${p.id}`}>
              <Card className="transition-colors hover:bg-accent/40">
                <CardContent className="p-4">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {p.role ?? "staff"} · {p.email ?? "no email"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
