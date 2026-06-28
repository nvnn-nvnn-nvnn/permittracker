/* eslint-disable @next/next/no-img-element -- static SVG logo; next/image adds no value for vectors and would force layout changes */
import logoSrc from "@/app/assets/cartledger full svg.svg";
import { cn } from "@/lib/utils";

type Variant = "graphic" | "text" | "lockup";

interface LogoProps {
  variant?: Variant;
  className?: string;
  /** Height applied to the mark in the lockup / graphic variant. */
  graphicClassName?: string;
  /** Kept for call-site compatibility; the CartLedger logo is a single mark. */
  textClassName?: string;
}

export function Logo({
  variant = "lockup",
  className,
  graphicClassName,
}: LogoProps) {
  const height =
    variant === "graphic" ? "h-8" : variant === "text" ? "h-6" : "h-7";
  return (
    <img
      src={logoSrc.src}
      alt="CartLedger"
      className={cn(`${height} w-auto`, graphicClassName, className)}
    />
  );
}
