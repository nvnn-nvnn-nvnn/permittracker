/**
 * Lightweight inline-SVG line chart (no charting dependency). Server-rendered.
 * Plots one or more series across evenly-spaced points; scales to include 0 so
 * negative values (e.g. a loss) read correctly against a baseline.
 */
export interface ChartSeries {
  name: string;
  /** Tailwind text color class (drives the line via `stroke-current`). */
  colorClass: string;
  /** Tailwind bg color class for the legend dot. */
  dotClass: string;
  values: number[];
}

export function OpsLineChart({
  labels,
  series,
  formatValue,
}: {
  labels: string[];
  series: ChartSeries[];
  formatValue: (cents: number) => string;
}) {
  const n = labels.length;
  const W = 100;
  const H = 34;
  const padY = 3;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const range = max - min || 1;
  const xAt = (i: number) => (n <= 1 ? W / 2 : (i * W) / (n - 1));
  const yAt = (v: number) =>
    padY + (1 - (v - min) / range) * (H - padY * 2);
  const zeroY = yAt(0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span
            key={s.name}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span className={`size-2 rounded-full ${s.dotClass}`} />
            {s.name}
          </span>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          peak {formatValue(max)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label="Performance over time"
      >
        {min < 0 && (
          <line
            x1="0"
            x2={W}
            y1={zeroY}
            y2={zeroY}
            className="stroke-border"
            strokeWidth="0.3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {series.map((s) => (
          <g key={s.name} className={s.colorClass}>
            {n > 1 && (
              <polyline
                points={s.values
                  .map((v, i) => `${xAt(i)},${yAt(v)}`)
                  .join(" ")}
                className="fill-none stroke-current"
                strokeWidth="1.4"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <circle
              cx={xAt(n - 1)}
              cy={yAt(s.values[n - 1] ?? 0)}
              r="1.1"
              className="fill-current"
            />
          </g>
        ))}
      </svg>

      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{labels[0]}</span>
        {n > 2 && <span>{labels[Math.floor((n - 1) / 2)]}</span>}
        <span>{labels[n - 1]}</span>
      </div>
    </div>
  );
}
