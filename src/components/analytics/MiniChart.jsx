import { useState, useMemo } from 'react';
import styles from './MiniChart.module.css';
import { formatCurrency, formatNumber } from '../../lib/statisticsUtils';

// ─── Helpers ────────────────────────────────────────────────────────────────

function abbreviateValue(val, isCurrency = false) {
  const abs = Math.abs(val);
  if (abs >= 1000000) return `${isCurrency ? '₱' : ''}${(val / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${isCurrency ? '₱' : ''}${(val / 1000).toFixed(1)}K`;
  return isCurrency ? `₱${Math.round(val)}` : String(Math.round(val));
}

function computeYTicks(min, max, count = 5) {
  const range = max - min || 1;
  const step = range / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(min + step * i));
}

function computeLinearRegression(data) {
  const n = data.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += data[i];
    sumXY += i * data[i];
    sumXX += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ─── SVG Line Chart ─────────────────────────────────────────────────────────

export function LineChart({
  data = [],
  labels = [],
  color = '#16a085',
  height = 160,
  isCurrency = false,
  showTrendLine = false,
  showGridlines = true,
}) {
  const [tooltip, setTooltip] = useState(null);

  const chartMetrics = useMemo(() => {
    if (!data || data.length === 0) return null;

    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const yTicks = computeYTicks(min, max, 5);
    const yMax = yTicks[yTicks.length - 1];
    const yMin = yTicks[0];
    const yRange = yMax - yMin || 1;

    const marginLeft = 58;
    const marginRight = 16;
    const marginTop = 12;
    const marginBottom = 30;
    const plotW = 1000 - marginLeft - marginRight;
    const plotH = height - marginTop - marginBottom;

    const points = data.map((val, i) => {
      const x = marginLeft + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
      const y = marginTop + plotH - ((val - yMin) / yRange) * plotH;
      return { x, y, val };
    });

    // Smooth curve via cubic Bézier
    let pathStr = '';
    if (points.length === 1) {
      pathStr = `M ${points[0].x},${points[0].y}`;
    } else {
      pathStr = `M ${points[0].x},${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
        const cpx2 = curr.x - (curr.x - prev.x) * 0.4;
        pathStr += ` C ${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`;
      }
    }

    // Area fill path
    const lastPt = points[points.length - 1];
    const firstPt = points[0];
    const areaStr = `${pathStr} L ${lastPt.x},${marginTop + plotH} L ${firstPt.x},${marginTop + plotH} Z`;

    // Trend line
    let trendPath = null;
    if (showTrendLine && data.length >= 2) {
      const reg = computeLinearRegression(data);
      if (reg) {
        const trendStart = reg.intercept;
        const trendEnd = reg.intercept + reg.slope * (data.length - 1);
        const ty1 = marginTop + plotH - ((trendStart - yMin) / yRange) * plotH;
        const ty2 = marginTop + plotH - ((trendEnd - yMin) / yRange) * plotH;
        trendPath = `M ${firstPt.x},${ty1} L ${lastPt.x},${ty2}`;
      }
    }

    return {
      points,
      pathStr,
      areaStr,
      trendPath,
      yTicks,
      yMin,
      yRange,
      plotH,
      plotW,
      marginLeft,
      marginRight,
      marginTop,
      marginBottom,
    };
  }, [data, height, showTrendLine]);

  if (!chartMetrics) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
        No data available
      </div>
    );
  }

  const { points, pathStr, areaStr, trendPath, yTicks, marginLeft, marginTop, plotH, plotW, marginBottom } = chartMetrics;
  const gradId = `grad-line-${color.replace('#', '')}`;

  return (
    <div className={styles.chartContainer} style={{ minHeight: height + (labels.length > 0 ? 0 : 0) }}>
      <svg viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y-axis gridlines + labels */}
        {showGridlines && yTicks.map((tick, i) => {
          const y = marginTop + plotH - ((tick - chartMetrics.yMin) / chartMetrics.yRange) * plotH;
          return (
            <g key={`ytick-${i}`}>
              <line
                x1={marginLeft}
                y1={y}
                x2={marginLeft + plotW}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth="1"
                strokeDasharray={i === 0 ? 'none' : '4,4'}
                opacity={i === 0 ? 0.6 : 0.35}
              />
              <text
                x={marginLeft - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="22"
                fill="var(--color-text-muted)"
                fontFamily="inherit"
              >
                {abbreviateValue(tick, isCurrency)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaStr} fill={`url(#${gradId})`} className={styles.areaPath} />

        {/* Main line */}
        <path
          d={pathStr}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.linePath}
        />

        {/* Trend line */}
        {trendPath && (
          <path
            d={trendPath}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeDasharray="8,6"
            opacity="0.5"
          />
        )}

        {/* Data point dots */}
        {points.map((pt, i) => (
          <circle
            key={`dot-${i}`}
            cx={pt.x}
            cy={pt.y}
            r="4"
            fill={color}
            stroke="var(--color-bg-primary)"
            strokeWidth="2"
            opacity={tooltip?.index === i ? 1 : 0}
            className={styles.dataDot}
          />
        ))}

        {/* Vertical crosshair on hover */}
        {tooltip && (
          <line
            x1={points[tooltip.index].x}
            y1={marginTop}
            x2={points[tooltip.index].x}
            y2={marginTop + plotH}
            stroke={color}
            strokeWidth="1"
            strokeDasharray="4,4"
            opacity="0.5"
          />
        )}

        {/* X-axis labels */}
        {labels.length > 0 && labels.map((label, i) => {
          const x = points[i]?.x;
          if (!x) return null;
          const maxLabels = Math.min(12, labels.length);
          const step = Math.max(1, Math.ceil(labels.length / maxLabels));
          const show = labels.length <= maxLabels || i === 0 || i === labels.length - 1 || i % step === 0;
          if (!show) return null;
          return (
            <text
              key={`xlabel-${i}`}
              x={x}
              y={height - 4}
              textAnchor="middle"
              fontSize="20"
              fill="var(--color-text-muted)"
              fontFamily="inherit"
            >
              {label}
            </text>
          );
        })}

        {/* Invisible hover rects for tooltip */}
        {points.map((pt, i) => {
          const w = plotW / data.length;
          return (
            <rect
              key={`hover-${i}`}
              x={pt.x - w / 2}
              y={marginTop}
              width={w}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setTooltip({ index: i, val: pt.val, label: labels[i], x: ((pt.x) / 1000) * 100, y: pt.y })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'crosshair' }}
            />
          );
        })}
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className={`${styles.tooltip} ${styles.visible}`}
          style={{
            left: `${tooltip.x}%`,
            top: `${(tooltip.y / height) * 100 - 18}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip.label && <div className={styles.tooltipLabel}>{tooltip.label}</div>}
          <div className={styles.tooltipValue}>{isCurrency ? formatCurrency(tooltip.val) : formatNumber(tooltip.val)}</div>
          {tooltip.index > 0 && (
            <div className={styles.tooltipDelta}>
              {(() => {
                const prev = data[tooltip.index - 1];
                if (!prev) return null;
                const pct = prev > 0 ? Math.round(((tooltip.val - prev) / prev) * 100) : 0;
                const sign = pct > 0 ? '+' : '';
                const cls = pct > 0 ? styles.deltaUp : pct < 0 ? styles.deltaDown : '';
                return <span className={cls}>{sign}{pct}% vs prev</span>;
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SVG Bar Chart ──────────────────────────────────────────────────────────

export function BarChart({ data = [], labels = [], color = '#3498db', height = 140 }) {
  const [tooltip, setTooltip] = useState(null);

  const chartMetrics = useMemo(() => {
    if (!data || data.length === 0) return null;

    const max = Math.max(...data, 1);
    const yTicks = computeYTicks(0, max, 4);
    const yMax = yTicks[yTicks.length - 1];

    const marginLeft = 48;
    const marginRight = 12;
    const marginTop = 8;
    const marginBottom = 30;
    const plotW = 1000 - marginLeft - marginRight;
    const plotH = height - marginTop - marginBottom;

    const barGroupWidth = plotW / data.length;
    const barWidth = barGroupWidth * 0.65;
    const barGap = (barGroupWidth - barWidth) / 2;

    const bars = data.map((val, i) => {
      const barHeight = Math.max((val / yMax) * plotH, 2);
      const x = marginLeft + i * barGroupWidth + barGap;
      const y = marginTop + plotH - barHeight;
      return { x, y, width: barWidth, height: barHeight, val };
    });

    const peakIndex = data.indexOf(Math.max(...data));

    return { bars, yTicks, yMax, plotH, plotW, marginLeft, marginTop, marginBottom, peakIndex };
  }, [data, height]);

  if (!chartMetrics) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
        No data available
      </div>
    );
  }

  const { bars, yTicks, yMax, plotH, plotW, marginLeft, marginTop, marginBottom, peakIndex } = chartMetrics;

  return (
    <div className={styles.chartContainer} style={{ minHeight: height }}>
      <svg viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        {/* Y-axis gridlines + labels */}
        {yTicks.map((tick, i) => {
          const y = marginTop + plotH - (tick / yMax) * plotH;
          return (
            <g key={`ytick-${i}`}>
              <line
                x1={marginLeft}
                y1={y}
                x2={marginLeft + plotW}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth="1"
                strokeDasharray={i === 0 ? 'none' : '4,4'}
                opacity={i === 0 ? 0.6 : 0.35}
              />
              <text
                x={marginLeft - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="20"
                fill="var(--color-text-muted)"
                fontFamily="inherit"
              >
                {formatNumber(tick)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {bars.map((bar, i) => (
          <g key={`bar-${i}`}>
            <rect
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              fill={tooltip?.index === i ? color : color}
              rx="5"
              opacity={tooltip?.index === i ? 1 : 0.8}
              className={styles.barRect}
              style={{ animationDelay: `${i * 0.03}s` }}
              onMouseEnter={() => setTooltip({
                index: i,
                val: bar.val,
                label: labels[i],
                x: ((bar.x + bar.width / 2) / 1000) * 100,
              })}
              onMouseLeave={() => setTooltip(null)}
            />
            {/* Peak indicator */}
            {i === peakIndex && bar.val > 0 && (
              <text
                x={bar.x + bar.width / 2}
                y={bar.y - 8}
                textAnchor="middle"
                fontSize="18"
                fill={color}
                fontWeight="700"
              >
                ★
              </text>
            )}
          </g>
        ))}

        {/* X-axis labels */}
        {labels.length > 0 && bars.map((bar, i) => {
          const maxLabels = Math.min(15, labels.length);
          const step = Math.max(1, Math.ceil(labels.length / maxLabels));
          const show = labels.length <= maxLabels || i === 0 || i === labels.length - 1 || i % step === 0;
          if (!show) return null;
          return (
            <text
              key={`xlabel-${i}`}
              x={bar.x + bar.width / 2}
              y={height - 4}
              textAnchor="middle"
              fontSize="18"
              fill="var(--color-text-muted)"
              fontFamily="inherit"
            >
              {labels[i]}
            </text>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className={`${styles.tooltip} ${styles.visible}`}
          style={{ left: `${tooltip.x}%`, top: '10px' }}
        >
          {tooltip.label && <div className={styles.tooltipLabel}>{tooltip.label}</div>}
          <div className={styles.tooltipValue}>{formatNumber(tooltip.val)}</div>
        </div>
      )}
    </div>
  );
}

// ─── Horizontal Bar for rankings ────────────────────────────────────────────

export function HorizontalBar({ value, max, color = '#16a085', height = 8 }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));

  return (
    <div style={{ width: '100%', height, background: 'var(--color-bg-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
      <div
        className={styles.hBarRect}
        style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: '4px',
        }}
      />
    </div>
  );
}

// ─── Heatmap Row (hourly activity) ──────────────────────────────────────────

export function HeatmapRow({ data = [], colorBase = '52, 152, 219', height = 30 }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data || data.length === 0) return null;

  const max = Math.max(...data, 1);
  const formatHour = (hour) => {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const display = hour % 12 || 12;
    return `${display}:00 ${suffix}`;
  };

  return (
    <div className={styles.chartContainer} style={{ height, display: 'flex', gap: '2px' }}>
      {data.map((val, i) => {
        const intensity = val === 0 ? 0.05 : 0.2 + (val / max) * 0.8;

        return (
          <div
            key={i}
            className={styles.heatmapRect}
            style={{
              flex: 1,
              background: `rgba(${colorBase}, ${intensity})`,
              borderRadius: '2px',
              animationDelay: `${i * 0.02}s`,
              cursor: 'pointer',
              border: val > 0 ? `1px solid rgba(${colorBase}, ${intensity + 0.2})` : 'none',
            }}
            onMouseEnter={() => setTooltip({ val, hour: i, x: (i / data.length) * 100 })}
            onMouseLeave={() => setTooltip(null)}
          />
        );
      })}

      {tooltip && (
        <div
          className={`${styles.tooltip} ${styles.visible}`}
          style={{ left: `${tooltip.x}%`, top: '-5px' }}
        >
          <div className={styles.tooltipLabel}>{formatHour(tooltip.hour)}</div>
          {`${tooltip.val} orders`}
        </div>
      )}
    </div>
  );
}

// ─── Dual-Series Comparison Chart ───────────────────────────────────────────

export function DualLineChart({
  data1 = [],
  data2 = [],
  labels = [],
  color1 = '#16a085',
  color2 = '#3498db',
  label1 = 'Series 1',
  label2 = 'Series 2',
  height = 180,
  isCurrency = false,
}) {
  const [tooltip, setTooltip] = useState(null);

  const chartMetrics = useMemo(() => {
    if ((!data1 || data1.length === 0) && (!data2 || data2.length === 0)) return null;

    const allData = [...data1, ...data2];
    const max = Math.max(...allData, 1);
    const min = Math.min(...allData, 0);
    const yTicks = computeYTicks(min, max, 5);
    const yMax = yTicks[yTicks.length - 1];
    const yMin = yTicks[0];
    const yRange = yMax - yMin || 1;

    const marginLeft = 58;
    const marginRight = 16;
    const marginTop = 24;
    const marginBottom = 30;
    const plotW = 1000 - marginLeft - marginRight;
    const plotH = height - marginTop - marginBottom;

    const maxLen = Math.max(data1.length, data2.length);

    function buildPath(data) {
      if (data.length === 0) return { points: [], pathStr: '' };
      const pts = data.map((val, i) => ({
        x: marginLeft + (maxLen === 1 ? plotW / 2 : (i / (maxLen - 1)) * plotW),
        y: marginTop + plotH - ((val - yMin) / yRange) * plotH,
        val,
      }));
      let path = `M ${pts[0].x},${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
        const cpx2 = curr.x - (curr.x - prev.x) * 0.4;
        path += ` C ${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`;
      }
      return { points: pts, pathStr: path };
    }

    const series1 = buildPath(data1);
    const series2 = buildPath(data2);

    return { series1, series2, yTicks, yMin, yRange, plotH, plotW, marginLeft, marginTop, marginBottom, maxLen };
  }, [data1, data2, height]);

  if (!chartMetrics) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
        No data available
      </div>
    );
  }

  const { series1, series2, yTicks, plotH, plotW, marginLeft, marginTop, maxLen } = chartMetrics;
  const gradId1 = `grad-dual-${color1.replace('#', '')}`;
  const gradId2 = `grad-dual-${color2.replace('#', '')}`;

  return (
    <div className={styles.chartContainer} style={{ minHeight: height }}>
      {/* Legend */}
      <div className={styles.chartLegend}>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: color1 }} />
          <span>{label1}</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: color2 }} />
          <span>{label2}</span>
        </div>
      </div>

      <svg viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId1} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color1} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color1} stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id={gradId2} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color2} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color2} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Y-axis gridlines */}
        {yTicks.map((tick, i) => {
          const y = marginTop + plotH - ((tick - chartMetrics.yMin) / chartMetrics.yRange) * plotH;
          return (
            <g key={`ytick-${i}`}>
              <line x1={marginLeft} y1={y} x2={marginLeft + plotW} y2={y} stroke="var(--color-border)" strokeWidth="1" strokeDasharray={i === 0 ? 'none' : '4,4'} opacity={i === 0 ? 0.6 : 0.3} />
              <text x={marginLeft - 8} y={y + 4} textAnchor="end" fontSize="20" fill="var(--color-text-muted)" fontFamily="inherit">
                {abbreviateValue(tick, isCurrency)}
              </text>
            </g>
          );
        })}

        {/* Series 1 */}
        {series1.pathStr && <path d={series1.pathStr} fill="none" stroke={color1} strokeWidth="3" strokeLinecap="round" />}

        {/* Series 2 */}
        {series2.pathStr && <path d={series2.pathStr} fill="none" stroke={color2} strokeWidth="3" strokeLinecap="round" />}

        {/* X-axis labels */}
        {labels.length > 0 && labels.map((label, i) => {
          const x = marginLeft + (maxLen === 1 ? plotW / 2 : (i / (maxLen - 1)) * plotW);
          const maxLabels = Math.min(12, labels.length);
          const step = Math.max(1, Math.ceil(labels.length / maxLabels));
          const show = labels.length <= maxLabels || i === 0 || i === labels.length - 1 || i % step === 0;
          if (!show) return null;
          return (
            <text key={`xlabel-${i}`} x={x} y={height - 4} textAnchor="middle" fontSize="20" fill="var(--color-text-muted)" fontFamily="inherit">
              {label}
            </text>
          );
        })}

        {/* Hover zones */}
        {Array.from({ length: maxLen }).map((_, i) => {
          const w = plotW / maxLen;
          const x = marginLeft + i * w;
          return (
            <rect
              key={`hover-${i}`}
              x={x}
              y={marginTop}
              width={w}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setTooltip({
                index: i,
                val1: data1[i],
                val2: data2[i],
                label: labels[i],
                x: ((x + w / 2) / 1000) * 100,
              })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'crosshair' }}
            />
          );
        })}
      </svg>

      {tooltip && (
        <div className={`${styles.tooltip} ${styles.visible}`} style={{ left: `${tooltip.x}%`, top: '20px' }}>
          {tooltip.label && <div className={styles.tooltipLabel}>{tooltip.label}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: color1 }}>{label1}: {isCurrency ? formatCurrency(tooltip.val1 || 0) : formatNumber(tooltip.val1 || 0)}</span>
            <span style={{ color: color2 }}>{label2}: {isCurrency ? formatCurrency(tooltip.val2 || 0) : formatNumber(tooltip.val2 || 0)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
