import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PasswordSignInForm,
  MagicLinkForm,
} from "@/components/features/auth-forms";

export const metadata = { title: "Sign in · CartLedger" };

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Use your email and password, or get a magic link.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <PasswordSignInForm />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          OR
          <span className="h-px flex-1 bg-border" />
        </div>
        <MagicLinkForm />
        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link href="/signup" className="font-medium text-foreground underline">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
