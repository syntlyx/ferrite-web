import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * The stacked-area trend the dashboard draws, as plain SVG.
 *
 * It replaces recharts, which was 353 KB (103 KB gzipped) — the largest thing
 * the panel loaded — for one chart. Everything it did here is in this file:
 * monotone curves, a dashed grid, two axes and a hover tooltip. The rest of the
 * library (bar/pie/radar/scatter/treemap, d3-scale, d3-shape, the animation
 * engine) was never used.
 *
 * Values are counts, so the curve is monotone-interpolated (Fritsch–Carlson):
 * a plain cubic spline overshoots on a spike and would draw negative traffic.
 */

export type TrendSeries<T> = {
  key: keyof T & string;
  label: string;
  color: string;
  /** Curve thickness, matching the weight each series had before. */
  strokeWidth: number;
  /** Opacity of the fill at the top of the gradient; it fades to 0 at the axis. */
  fillOpacity: number;
};

type Props<T extends Record<string, unknown>> = {
  data: T[];
  /** Field holding the x label; only every `labelEvery`-th one is drawn. */
  labelKey: keyof T & string;
  series: TrendSeries<T>[];
  height?: number;
  labelEvery?: number;
  /** Rendered next to the cursor; receives the hovered row. */
  tooltip: (point: T, values: { label: string; color: string; value: number }[]) => React.ReactNode;
};

/** Room for the axis labels, in the same places recharts put them. */
const PAD = { top: 6, right: 8, bottom: 22, left: 46 };
const Y_TICKS = 4;

/** Axis ticks that land on round numbers, like `0 20 40 60 80`. */
function niceTicks(max: number, count: number): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return ticks;
}

/**
 * Monotone cubic path through `points` (d3's curveMonotoneX, and what recharts
 * drew with `type="monotone"`): tangents are clamped so the curve never swings
 * past the values it connects.
 */
function monotonePath(points: [number, number][]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${points[0]![0]} ${points[0]![1]}`;

  // Secant slopes between neighbours, then a tangent per point.
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    slopes.push((y1 - y0) / (x1 - x0 || 1));
  }
  const tangents: number[] = new Array(n);
  tangents[0] = slopes[0]!;
  tangents[n - 1] = slopes[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const prev = slopes[i - 1]!;
    const next = slopes[i]!;
    // A local extremum flattens: that is what keeps the curve from overshooting.
    tangents[i] = prev * next <= 0 ? 0 : (prev + next) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const slope = slopes[i]!;
    if (slope === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i]! / slope;
    const b = tangents[i + 1]! / slope;
    const h = Math.hypot(a, b);
    if (h > 3) {
      tangents[i] = ((3 / h) * a) * slope;
      tangents[i + 1] = ((3 / h) * b) * slope;
    }
  }

  let d = `M ${points[0]![0].toFixed(2)} ${points[0]![1].toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const dx = (x1 - x0) / 3;
    d +=
      ` C ${(x0 + dx).toFixed(2)} ${(y0 + dx * tangents[i]!).toFixed(2)}` +
      ` ${(x1 - dx).toFixed(2)} ${(y1 - dx * tangents[i + 1]!).toFixed(2)}` +
      ` ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  return d;
}

function AreaTrendInner<T extends Record<string, unknown>>({
  data,
  labelKey,
  series,
  height = 220,
  labelEvery = 18,
  tooltip,
}: Props<T>) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  // Width comes from the box we sit in; the SVG is drawn at real pixel size so
  // strokes and text keep their weight instead of being scaled.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry?.contentRect.width ?? 0));
    });
    observer.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);

  const max = data.reduce(
    (acc, row) => series.reduce((m, s) => Math.max(m, Number(row[s.key]) || 0), acc),
    0,
  );
  const ticks = niceTicks(max, Y_TICKS);
  const top = ticks[ticks.length - 1] || 1;

  const xAt = useCallback(
    (i: number) => PAD.left + (data.length < 2 ? plotW / 2 : (i / (data.length - 1)) * plotW),
    [data.length, plotW],
  );
  const yAt = useCallback(
    (v: number) => PAD.top + plotH - (Math.max(0, v) / top) * plotH,
    [plotH, top],
  );

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (data.length === 0 || plotW <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left - PAD.left) / plotW;
    const index = Math.round(ratio * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, index)));
  };

  const hovered = hover !== null ? data[hover] : undefined;
  const hoveredValues = hovered
    ? series.map((s) => ({ label: s.label, color: s.color, value: Number(hovered[s.key]) || 0 }))
    : [];
  // Keep the tooltip inside the card: it flips to the left of the cursor once
  // the cursor is past the middle.
  const hoverX = hover !== null ? xAt(hover) : 0;
  const flip = hoverX > width / 2;

  return (
    <div ref={wrap} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
        >
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`trend-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={s.fillOpacity} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {/* Grid + y labels */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={yAt(tick)}
                y2={yAt(tick)}
                stroke="var(--color-bdr)"
                strokeDasharray="3 3"
              />
              <text
                x={PAD.left - 8}
                y={yAt(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--color-muted)"
              >
                {tick}
              </text>
            </g>
          ))}

          {/* x labels */}
          {data.map((row, i) =>
            i % labelEvery === 0 ? (
              <text
                key={i}
                x={xAt(i)}
                y={height - 6}
                textAnchor="middle"
                fontSize={10}
                fill="var(--color-muted)"
              >
                {String(row[labelKey] ?? "")}
              </text>
            ) : null,
          )}

          {/* Series: fill first, then the curve on top of it */}
          {series.map((s) => {
            const points: [number, number][] = data.map((row, i) => [
              xAt(i),
              yAt(Number(row[s.key]) || 0),
            ]);
            const line = monotonePath(points);
            if (!line) return null;
            const baseline = PAD.top + plotH;
            const area = `${line} L ${xAt(data.length - 1).toFixed(2)} ${baseline} L ${xAt(0).toFixed(2)} ${baseline} Z`;
            return (
              <g key={s.key}>
                <path d={area} fill={`url(#trend-${s.key})`} />
                <path
                  d={line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {/* Hover marker */}
          {hover !== null && (
            <g pointerEvents="none">
              <line
                x1={hoverX}
                x2={hoverX}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--color-bdr)"
              />
              {series.map((s) => (
                <circle
                  key={s.key}
                  cx={hoverX}
                  cy={yAt(Number(data[hover]?.[s.key]) || 0)}
                  r={2.5}
                  fill={s.color}
                />
              ))}
            </g>
          )}
        </svg>
      )}

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 z-10"
          style={
            flip
              ? { right: Math.max(8, width - hoverX + 12) }
              : { left: Math.max(8, hoverX + 12) }
          }
        >
          {tooltip(hovered, hoveredValues)}
        </div>
      )}
    </div>
  );
}

/** Memoised: the dashboard re-renders on several independent timers. */
export const AreaTrend = memo(AreaTrendInner) as typeof AreaTrendInner;
