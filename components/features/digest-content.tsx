/**
 * Minimal renderer for digest markdown. Content is constrained to
 * `### Heading` blocks + plain paragraphs (see lib/digest/generate.ts), so a
 * tiny parser beats pulling in a markdown dependency.
 */
export function DigestContent({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      {blocks.map((b, i) =>
        b.startsWith("### ") ? (
          <h3 key={i} className="text-sm font-semibold">
            {b.slice(4).trim()}
          </h3>
        ) : (
          <p key={i} className="text-sm text-muted-foreground">
            {b}
          </p>
        ),
      )}
    </div>
  );
}
