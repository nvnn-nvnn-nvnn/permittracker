import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Compliance items · PermitKeep" };

export default function ItemsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Compliance items
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>No items yet</CardTitle>
          <CardDescription>
            Permits, inspections, certs, and COIs land in Phase 2.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
