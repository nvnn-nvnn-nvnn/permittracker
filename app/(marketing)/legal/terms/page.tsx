import type { Metadata } from "next";
import TermsOfService from "@/components/legal/terms-of-service";

export const metadata: Metadata = {
  title: "Terms of Service · VendGuard",
};

export default function ToSPage() {
  return <TermsOfService />;
}
