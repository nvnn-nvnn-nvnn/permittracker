import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignUpForm } from "@/components/features/auth-forms";

export const metadata = { title: "Create account · VendGuard" };

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          A workspace is created for you on first sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SignUpForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
