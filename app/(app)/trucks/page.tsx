import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Trucks · PermitKeep" };

export default function TrucksPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Trucks</h1>
      <Card>
        <CardHeader>
          <CardTitle>No trucks yet</CardTitle>
          <CardDescription>
            Truck CRUD lands in Phase 2 (manual compliance items).
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
