import { VenueForm } from "@/components/features/venue-form";

export const metadata = { title: "Add venue · VendGuard" };

export default function NewVenuePage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Add venue</h1>
      <VenueForm />
    </div>
  );
}
