"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPageGuide } from "@/lib/page-guides";

/**
 * Collapsible per-page "How-to" panel. Wired once into the app shell; it picks
 * the guide for the current route from lib/page-guides and remembers (per page)
 * whether the user collapsed it, so it helps newcomers without nagging regulars.
 */
export function PageGuide() {
  const pathname = usePathname();
  const guide = getPageGuide(pathname);
  const storageKey = guide ? `cl_guide_collapsed:${guide.title}` : "";
  const [collapsed, setCollapsed] = useState(false);

  // Default expanded (matches SSR); collapse if the user did so before.
  useEffect(() => {
    if (!storageKey) return;
    try {
      setCollapsed(localStorage.getItem(storageKey) === "1");
    } catch {
      /* private mode / no storage — stay expanded */
    }
  }, [storageKey]);

  if (!guide) return null;

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-brand-ink/15 bg-brand-ink/[0.03]">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <HelpCircle className="size-4 text-brand-ink" />
          How-to: {guide.title}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-180",
          )}
        />
      </button>

      {!collapsed && (
        <div className="space-y-2.5 px-4 pb-4">
          {guide.intro && (
            <p className="text-sm text-muted-foreground">{guide.intro}</p>
          )}
          <ol className="space-y-1.5">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-ink/10 text-[11px] font-semibold text-brand-ink">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          {guide.tip && (
            <p className="text-xs text-muted-foreground/80">💡 {guide.tip}</p>
          )}
        </div>
      )}
    </div>
  );
}
