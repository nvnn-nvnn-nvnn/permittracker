import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Check your email · CartLedger" };

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const isMagic = reason === "magic";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          {isMagic
            ? "We sent you a magic sign-in link. Open it on this device to continue."
            : "We sent a confirmation link to verify your address. Click it to activate your account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Didn&apos;t get it? Check spam, or{" "}
          <Link href="/login" className="font-medium text-foreground underline">
            try again
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
