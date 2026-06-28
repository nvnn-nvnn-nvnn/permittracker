import { EventForm } from "@/components/features/event-form";

export const metadata = { title: "Add event · CartLedger" };

export default function NewEventPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Add event</h1>
      <p className="-mt-4 max-w-lg text-sm text-muted-foreground">
        Track a prospective event you want to apply to or work. Set where it is
        in your application pipeline, and link a venue to carry its COI
        requirements.
      </p>
      <EventForm />
    </div>
  );
}
