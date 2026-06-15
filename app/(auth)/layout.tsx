import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/brand/logo";
import authBg from "@/app/assets/foodtruck-1.jpg";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      {/* Full-bleed food-truck backdrop, softened so the card stays readable */}
      <Image
        src={authBg}
        alt=""
        fill
        priority
        sizes="100vw"
        placeholder="blur"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-background/85 backdrop-blur-sm" />

      <div className="relative z-10 flex w-full flex-col items-center">
        <Link href="/" aria-label="VendGuard home" className="mb-8">
          <Logo variant="lockup" graphicClassName="h-9" textClassName="h-6" />
        </Link>
        <div className="w-full max-w-sm">{children}</div>
        <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
          Stay open. We track every permit, inspection, cert, and COI that can
          shut you down.
        </p>
      </div>
    </div>
  );
}
