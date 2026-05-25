import textLogo from "@/app/assets/Vendguardtextlogo.svg";
import graphic from "@/app/assets/vendgaurdgraphic.svg";
import { cn } from "@/lib/utils";

type Variant = "graphic" | "text" | "lockup";

interface LogoProps {
  variant?: Variant;
  className?: string;
  /** Width applied to the graphic mark in the lockup or graphic variant. */
  graphicClassName?: string;
  /** Width applied to the wordmark in the lockup or text variant. */
  textClassName?: string;
}

export function Logo({
  variant = "lockup",
  className,
  graphicClassName,
  textClassName,
}: LogoProps) {
  if (variant === "graphic") {
    return (
      <img
        src={graphic.src}
        alt="VendGuard"
        className={cn("h-8 w-auto", graphicClassName, className)}
      />
    );
  }
  if (variant === "text") {
    return (
      <img
        src={textLogo.src}
        alt="VendGuard"
        className={cn("h-6 w-auto", textClassName, className)}
      />
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img
        src={graphic.src}
        alt=""
        className={cn("h-7 w-auto", graphicClassName)}
      />
      <img
        src={textLogo.src}
        alt="VendGuard"
        className={cn("h-5 w-auto", textClassName)}
      />
    </span>
  );
}
