"use client";
import { useState } from "react";
import { ScanLine, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { ItemForm, type TruckOption, type ParentOption } from "./item-form";
import { ScanToCreate } from "./scan-to-create";

type Mode = "scan" | "manual";

const OPTIONS: {
  mode: Mode;
  icon: typeof ScanLine;
  title: string;
  desc: string;
}[] = [
  {
    mode: "scan",
    icon: ScanLine,
    title: "Scan a document",
    desc: "Upload a permit — AI reads it and fills the form.",
  },
  {
    mode: "manual",
    icon: PencilLine,
    title: "Enter manually",
    desc: "Type the details in yourself.",
  },
];

export function NewItemChooser(props: {
  trucks: TruckOption[];
  parentOptions?: ParentOption[];
  people?: TruckOption[];
  venues?: TruckOption[];
}) {
  const [mode, setMode] = useState<Mode>("scan");

  return (
    <div className="space-y-6">
      <div className="flex max-w-2xl flex-col gap-2">
        {OPTIONS.map(({ mode: m, icon: Icon, title, desc }) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-4 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent/40",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">
                  {desc}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div>
        {mode === "scan" ? (
          <ScanToCreate {...props} />
        ) : (
          <ItemForm {...props} />
        )}
      </div>
    </div>
  );
}
