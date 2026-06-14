import type { Metadata } from "next";
import PrivacyPolicy from "@/components/legal/privacy-policy";

export const metadata: Metadata = {
  title: "Privacy Policy · VendGuard",
};

export default function PrivacyPage() {
  return <PrivacyPolicy />;
}
