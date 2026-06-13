import { useState } from 'react';
import styles from './MiniChart.module.css';
import { formatCurrency, formatNumber } from '../../lib/statisticsUtils';

export function LineChart({ data = [], labels = [], color = '#16a085', height = 100, isCurrency = false }) {
  const [tooltip, setTooltip] = useState(null);
  
  if (!data || data.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>No data</div>;
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min;
  
  const width = 1000;
  const points = data.map((val, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = height - ((val - min) / range) * (height * 0.8) - (height * 0.1);
    return `${x},${y}`;
  });

  const pathStr = `M ${points.join(' L ')}`;
  const areaStr = `${pathStr} L ${width},${height} L 0,${height} Z`;

  const labelStep = Math.max(1, Math.ceil(labels.length / 7));

  return (
    <div className={styles.chartContainer} style={{ minHeight: height + (labels.length ? 28 : 0) }}>
      <div style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        
        <path d={areaStr} fill={`url(#grad-${color})`} className={styles.areaPath} />
        
        <path 
          d={pathStr} 
          fill="none" 
          stroke={color} 
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className={styles.linePath} 
        />
        
        {data.map((val, i) => {
          const x = (i / Math.max(data.length - 1, 1)) * width;
          const pctX = (i / Math.max(data.length - 1, 1)) * 100;
          return (
            <rect
              key={i}
              x={x - (width / data.length) / 2}
              y="0"
              width={width / data.length}
              height={height}
              fill="transparent"
              onMouseEnter={() => setTooltip({ val, label: labels[i], x: pctX })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'crosshair' }}
            />
          );
        })}
      </svg>
      </div>

      {labels.length > 0 && (
        <div className={styles.axisLabels}>
          {labels.map((label, i) => {
            const show = labels.length <= 8 || i === 0 || i === labels.length - 1 || i % labelStep === 0;
            return (
              <span key={`${label}-${i}`} className={!show ? styles.axisLabelHidden : undefined}>
                {show ? label : ''}
              </span>
            );
          })}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div 
          className={`${styles.tooltip} ${styles.visible}`} 
          style={{ left: `${tooltip.x}%`, top: '50%' }}
        >
          {tooltip.label && <div className={styles.tooltipLabel}>{tooltip.label}</div>}
          {isCurrency ? formatCurrency(tooltip.val) : formatNumber(tooltip.val)}
        </div>
      )}
    </div>
  );
}

/**
 * Vertical Bar Chart
 */
export function BarChart({ data = [], labels = [], color = '#3498db', height = 120 }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data || data.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>No data</div>;
  }

  const max = Math.max(...data, 1);
  const width = 1000;
  const barWidth = (width / data.length) * 0.7;
  const spacing = (width / data.length) * 0.3;
  const labelStep = Math.max(1, Math.ceil(labels.length / 7));

  return (
    <div className={styles.chartContainer} style={{ minHeight: height + (labels.length ? 28 : 0) }}>
      <div style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        {data.map((val, i) => {
          const barHeight = Math.max((val / max) * (height * 0.9), 2); // Min 2px height
          const x = i * (barWidth + spacing) + spacing / 2;
          const y = height - barHeight;
          const pctX = (x + barWidth / 2) / width * 100;

          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={color}
              rx="4"
              className={styles.barRect}
              style={{ animationDelay: `${i * 0.05}s` }}
              onMouseEnter={() => setTooltip({ val, label: labels[i], x: pctX })}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}
      </svg>
      </div>

      {tooltip && (
        <div 
          className={`${styles.tooltip} ${styles.visible}`} 
          style={{ left: `${tooltip.x}%`, top: '10px' }}
        >
          {tooltip.label && <div style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem' }}>{tooltip.label}</div>}
          {formatNumber(tooltip.val)}
        </div>
      )}

      {labels.length > 0 && (
        <div className={styles.axisLabels}>
          {labels.map((label, i) => {
            const show = labels.length <= 8 || i === 0 || i === labels.length - 1 || i % labelStep === 0;
            return (
              <span key={`${label}-${i}`} className={!show ? styles.axisLabelHidden : undefined}>
                {show ? label : ''}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Horizontal Bar for rankings
 */
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
          borderRadius: '4px' 
        }} 
      />
    </div>
  );
}

/**
 * Heatmap Row (e.g. for hourly activity)
 */
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
        // Opacity based on value relative to max. Min 0.1 for empty slots.
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
              border: val > 0 ? `1px solid rgba(${colorBase}, ${intensity + 0.2})` : 'none'
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
