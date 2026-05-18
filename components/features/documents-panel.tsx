"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/react";
import { createSupabaseBrowserClient } from "@/lib/auth/client";
import { DOCUMENTS_BUCKET } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS_VARIANT: Record<
  string,
  "green" | "yellow" | "red" | "outline"
> = {
  uploading: "outline",
  uploaded: "yellow",
  extracting: "yellow",
  extracted: "green",
  failed: "red",
};

export function DocumentsPanel({
  complianceItemId,
}: {
  complianceItemId: string;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const files = trpc.file.listForItem.useQuery({ complianceItemId });
  const createUploadUrl = trpc.file.createUploadUrl.useMutation();
  const confirmUploaded = trpc.file.confirmUploaded.useMutation();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const target = await createUploadUrl.mutateAsync({
        complianceItemId,
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
      await utils.file.listForItem.invalidate({ complianceItemId });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Documents</CardTitle>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={onPick}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Uploading…" : "Upload document"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {files.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {files.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No documents yet. Upload a permit photo or PDF — Claude will read
            it and suggest the fields for you to confirm.
          </p>
        )}
        {files.data?.map((f) => (
          <FileRow
            key={f.id}
            file={f}
            complianceItemId={complianceItemId}
          />
        ))}
      </CardContent>
    </Card>
  );
}

type FileRowProps = {
  file: {
    id: string;
    originalFilename: string;
    mimeType: string;
    status: string;
    needsManualReview: boolean;
    extractionError: string | null;
  };
  complianceItemId: string;
};

/** Inline preview: images render directly, PDFs in a framed viewer. */
function FilePreview({
  fileId,
  mimeType,
  filename,
}: {
  fileId: string;
  mimeType: string;
  filename: string;
}) {
  const view = trpc.file.viewUrl.useQuery(
    { fileId },
    { staleTime: 9 * 60 * 1000, refetchOnWindowFocus: false },
  );

  if (view.isLoading)
    return (
      <div className="mt-2 h-40 animate-pulse rounded-md bg-muted" />
    );
  if (view.error || !view.data)
    return (
      <p className="mt-2 text-xs text-destructive">
        Couldn&apos;t load preview.
      </p>
    );

  if (mimeType.startsWith("image/")) {
    return (
      // Signed, short-lived Storage URL; next/image can't optimize it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={view.data.url}
        alt={filename}
        className="mt-2 max-h-80 w-auto rounded-md border object-contain"
      />
    );
  }
  if (mimeType === "application/pdf") {
    return (
      <iframe
        title={filename}
        src={view.data.url}
        className="mt-2 h-96 w-full rounded-md border"
      />
    );
  }
  return (
    <a
      href={view.data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-block text-sm underline"
    >
      Open {filename}
    </a>
  );
}

function FileRow({ file, complianceItemId }: FileRowProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const proposal = trpc.file.latestProposal.useQuery({ fileId: file.id });
  const runNow = trpc.file.runExtractionNow.useMutation();
  const apply = trpc.file.applyProposal.useMutation();
  const reject = trpc.file.rejectProposal.useMutation();
  const signed = trpc.file.signedReadUrl.useMutation();
  const [msg, setMsg] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const refresh = async () => {
    await Promise.all([
      utils.file.listForItem.invalidate({ complianceItemId }),
      utils.file.latestProposal.invalidate({ fileId: file.id }),
    ]);
    router.refresh();
  };

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <button
          className="min-w-0 truncate text-left text-sm font-medium underline-offset-2 hover:underline"
          onClick={async () => {
            const r = await signed.mutateAsync({ fileId: file.id });
            window.open(r.url, "_blank");
          }}
        >
          {file.originalFilename}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? "Hide" : "Preview"}
          </button>
          <Badge variant={STATUS_VARIANT[file.status] ?? "outline"}>
            {file.status}
          </Badge>
        </div>
      </div>

      {showPreview && (
        <FilePreview
          fileId={file.id}
          mimeType={file.mimeType}
          filename={file.originalFilename}
        />
      )}

      {file.needsManualReview && (
        <p className="mt-2 rounded-md bg-status-yellow/15 px-3 py-2 text-xs text-status-yellow">
          ⚠ Low confidence on the expiration date — review this manually
          before relying on it.
        </p>
      )}
      {file.status === "failed" && (
        <p className="mt-2 text-xs text-destructive">
          Extraction failed: {file.extractionError}
        </p>
      )}

      {(file.status === "uploaded" || file.status === "failed") && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={runNow.isPending}
          onClick={async () => {
            setMsg(null);
            try {
              await runNow.mutateAsync({ fileId: file.id });
              await refresh();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Extraction failed");
            }
          }}
        >
          {runNow.isPending ? "Reading…" : "Run extraction now"}
        </Button>
      )}
      {msg && <p className="mt-2 text-xs text-destructive">{msg}</p>}

      {proposal.data && proposal.data.status === "pending" && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            Suggested fields (confirm before they touch the item)
          </p>
          <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            <Pair
              k="Type"
              v={proposal.data.documentType}
              c={proposal.data.fieldConfidence.documentType}
            />
            <Pair
              k="Subtype"
              v={proposal.data.subtype}
              c={proposal.data.fieldConfidence.subtype}
            />
            <Pair
              k="Jurisdiction"
              v={proposal.data.jurisdiction}
              c={proposal.data.fieldConfidence.jurisdiction}
            />
            <Pair
              k="Identifier"
              v={proposal.data.identifierNumber}
              c={proposal.data.fieldConfidence.identifierNumber}
            />
            <Pair
              k="Issued"
              v={fmt(proposal.data.issueDate)}
              c={proposal.data.fieldConfidence.issueDate}
            />
            <Pair
              k="Expires"
              v={fmt(proposal.data.expirationDate)}
              c={proposal.data.fieldConfidence.expirationDate}
            />
            <Pair
              k="Holder"
              v={proposal.data.holderName}
              c={proposal.data.fieldConfidence.holderName}
            />
          </dl>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              disabled={apply.isPending}
              onClick={async () => {
                setMsg(null);
                try {
                  await apply.mutateAsync({
                    proposalId: proposal.data!.id,
                  });
                  await refresh();
                } catch (e) {
                  setMsg(
                    e instanceof Error ? e.message : "Could not apply",
                  );
                }
              }}
            >
              {apply.isPending ? "Applying…" : "Apply to item"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={reject.isPending}
              onClick={async () => {
                await reject.mutateAsync({ proposalId: proposal.data!.id });
                await refresh();
              }}
            >
              Reject
            </Button>
          </div>
        </div>
      )}
      {proposal.data && proposal.data.status !== "pending" && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Proposal {proposal.data.status}.
            {proposal.data.status === "rejected" &&
              " Re-run OCR to get a fresh suggestion."}
          </p>
          {proposal.data.status === "rejected" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={runNow.isPending}
              onClick={async () => {
                setMsg(null);
                try {
                  await runNow.mutateAsync({ fileId: file.id });
                  await refresh();
                } catch (e) {
                  setMsg(
                    e instanceof Error ? e.message : "Extraction failed",
                  );
                }
              }}
            >
              {runNow.isPending ? "Retrying…" : "Retry extraction"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Pair({
  k,
  v,
  c,
}: {
  k: string;
  v: string | null | undefined;
  c?: "low" | "medium" | "high";
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="flex items-center gap-2">
        <span className="font-medium">{v || "—"}</span>
        {c && (
          <Badge
            variant={
              c === "high" ? "green" : c === "medium" ? "yellow" : "red"
            }
          >
            {c}
          </Badge>
        )}
      </span>
    </div>
  );
}

function fmt(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", { timeZone: "UTC" });
}
