"use client";
import { useRef, useState, type ChangeEvent } from "react";
import { ScanLine, Loader2, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc/react";
import { createSupabaseBrowserClient } from "@/lib/auth/client";
import { DOCUMENTS_BUCKET } from "@/lib/constants";
import { itemTypeValues } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { ItemForm, type TruckOption, type ParentOption } from "./item-form";

type Status = "idle" | "uploading" | "reading" | "ready";

const STEPS = [
  "Upload a photo or PDF of your permit, license, or COI.",
  "AI reads it and extracts the fields automatically.",
  "Review everything and save — you confirm before it's created.",
];

/**
 * Document-first entry point (§6 OCR flow). Uploads a permit with NO compliance
 * item yet (orphan file), runs OCR synchronously (deterministic locally), then
 * swaps in a proposal-prefilled ItemForm for the user to review and submit.
 */
export function ScanToCreate({
  trucks,
  parentOptions = [],
  people = [],
  venues = [],
}: {
  trucks: TruckOption[];
  parentOptions?: ParentOption[];
  people?: TruckOption[];
  venues?: TruckOption[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [fileId, setFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createUploadUrl = trpc.file.createUploadUrl.useMutation();
  const confirmUploaded = trpc.file.confirmUploaded.useMutation();
  const runExtraction = trpc.file.runExtractionNow.useMutation();

  const proposal = trpc.file.latestProposal.useQuery(
    { fileId: fileId ?? "" },
    { enabled: !!fileId },
  );

  const busy = status === "uploading" || status === "reading";

  const docType = proposal.data?.documentType;
  const initialType = itemTypeValues.includes(
    docType as (typeof itemTypeValues)[number],
  )
    ? (docType as (typeof itemTypeValues)[number])
    : undefined;

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileId(null);
    setStatus("uploading");
    try {
      const target = await createUploadUrl.mutateAsync({
        complianceItemId: null, // orphan upload — no item exists yet
        originalFilename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .uploadToSignedUrl(target.path, target.token, file);
      if (upErr) throw upErr;

      await confirmUploaded.mutateAsync({ fileId: target.fileId });

      // Run OCR synchronously so the user gets a deterministic result (the
      // Inngest event is async / a no-op without the dev server).
      setStatus("reading");
      await runExtraction.mutateAsync({ fileId: target.fileId });

      setFileId(target.fileId);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus("idle");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const heading =
    status === "uploading"
      ? "Uploading your document…"
      : status === "reading"
        ? "Reading it with AI…"
        : "Scan a permit to auto-fill";

  const subtext =
    status === "idle"
      ? "Upload a document and we'll extract the details for you to review — no manual typing."
      : "Hang tight, this usually takes a few seconds.";

  return (
    <div className="max-w-2xl space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={onPick}
      />

      {status !== "ready" && (
        <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <ScanLine className="h-6 w-6" />
            )}
          </div>

          <h3 className="mt-4 text-base font-semibold">{heading}</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {subtext}
          </p>

          <Button
            type="button"
            size="lg"
            className="mt-5"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Working…" : "Choose a file"}
          </Button>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            PDF, JPG, PNG, or WEBP · up to 25 MB
          </p>
        </div>
      )}

      {status === "idle" && (
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={i}
              className="rounded-lg border border-border/60 bg-card/30 p-3 text-xs text-muted-foreground"
            >
              <span className="mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-brand-ink">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {status === "ready" &&
        (proposal.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading suggestions…
          </p>
        ) : (
          <ItemForm
            trucks={trucks}
            parentOptions={parentOptions}
            people={people}
            venues={venues}
            attachFileId={fileId ?? undefined}
            initialType={initialType}
            initialSubtype={proposal.data?.subtype ?? undefined}
            initialValues={{
              jurisdiction: proposal.data?.jurisdiction,
              identifier: proposal.data?.identifierNumber,
              issueDate: proposal.data?.issueDate,
              expirationDate: proposal.data?.expirationDate,
              feeDueDate: proposal.data?.feeDueDate,
              holderName: proposal.data?.holderName,
              feeAmount:
                proposal.data?.renewalFeeAmountCents != null
                  ? (proposal.data.renewalFeeAmountCents / 100).toString()
                  : null,
            }}
          />
        ))}
    </div>
  );
}
