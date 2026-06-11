/**
 * Analytics Icons — Custom SVG icon components
 * 
 * Replaces all emoji usage in the analytics dashboard.
 * Each icon accepts: size (default 24), color (default currentColor), className
 */

const defaultProps = { size: 24, color: 'currentColor' };

function wrap(props, children) {
  const { size = 24, color = 'currentColor', className = '' } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

/* ── Metric Card Icons ─────────────────────────── */

/** Box / Package — replaces 📦 */
export function OrdersIcon(props = {}) {
  return wrap(props, <>
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </>);
}

/** Currency / Coins — replaces 💰 💵 💸 */
export function RevenueIcon(props = {}) {
  return wrap(props, <>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </>);
}

/** Bar Chart — replaces 📊 */
export function ChartIcon(props = {}) {
  return wrap(props, <>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </>);
}

/** Star — replaces ⭐ */
export function StarIcon(props = {}) {
  return wrap(props, <>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </>);
}

/** Calendar — replaces 📅 📆 */
export function CalendarIcon(props = {}) {
  return wrap(props, <>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </>);
}

/** Calendar Range — weekly variant */
export function CalendarRangeIcon(props = {}) {
  return wrap(props, <>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <path d="M8 14h.01" />
    <path d="M12 14h.01" />
    <path d="M16 14h.01" />
  </>);
}

/** Clipboard — replaces 📋 */
export function ClipboardIcon(props = {}) {
  return wrap(props, <>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </>);
}

/** Trend Up — replaces 📈 */
export function TrendUpIcon(props = {}) {
  return wrap(props, <>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </>);
}

/** Trend Down */
export function TrendDownIcon(props = {}) {
  return wrap(props, <>
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </>);
}

/* ── AI Analyst Panel Icons ────────────────────── */

/** Brain / AI */
export function BrainIcon(props = {}) {
  return wrap(props, <>
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
  </>);
}

/** Alert Triangle — anomalies */
export function AlertIcon(props = {}) {
  return wrap(props, <>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </>);
}

/** Inventory / Box Stack */
export function InventoryIcon(props = {}) {
  return wrap(props, <>
    <path d="M20 8h-9.5c-1.4 0-2.1 0-2.68.27a2.5 2.5 0 0 0-1.05 1.05C7 9.9 7 10.6 7 12v6c0 1.4 0 2.1.27 2.68a2.5 2.5 0 0 0 1.05 1.05C8.9 22 9.6 22 11 22h6c1.4 0 2.1 0 2.68-.27a2.5 2.5 0 0 0 1.05-1.05C21 20.1 21 19.4 21 18v-8a2 2 0 0 0-2-2" />
    <path d="M16 8V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    <line x1="12" y1="12" x2="12" y2="18" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </>);
}

/** People / Staff */
export function StaffIcon(props = {}) {
  return wrap(props, <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>);
}

/** Flag — priority */
export function PriorityIcon(props = {}) {
  return wrap(props, <>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </>);
}

/** Shield / Check — strengths */
export function StrengthIcon(props = {}) {
  return wrap(props, <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </>);
}

/** Arrow Down Circle — weaknesses */
export function WeaknessIcon(props = {}) {
  return wrap(props, <>
    <circle cx="12" cy="12" r="10" />
    <polyline points="8 12 12 16 16 12" />
    <line x1="12" y1="8" x2="12" y2="16" />
  </>);
}

/** Activity Line — trends */
export function TrendIcon(props = {}) {
  return wrap(props, <>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </>);
}

/** Refresh / Rotate */
export function RefreshIcon(props = {}) {
  return wrap(props, <>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
  </>);
}

/** Lightbulb — opportunities */
export function OpportunityIcon(props = {}) {
  return wrap(props, <>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </>);
}

/** Clock — peak hours */
export function ClockIcon(props = {}) {
  return wrap(props, <>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </>);
}

/** Target — action plans */
export function TargetIcon(props = {}) {
  return wrap(props, <>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </>);
}

/** Summary / File Text — executive summary */
export function SummaryIcon(props = {}) {
  return wrap(props, <>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </>);
}

/** Users / Customer behavior */
export function CustomersIcon(props = {}) {
  return wrap(props, <>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>);
}

/** Conclusion / Check Circle */
export function ConclusionIcon(props = {}) {
  return wrap(props, <>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </>);
}

/** Empty state chart — no data */
export function EmptyChartIcon(props = {}) {
  return wrap({ ...props, size: props.size || 48 }, <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="7" y1="17" x2="7" y2="13" />
    <line x1="12" y1="17" x2="12" y2="9" />
    <line x1="17" y1="17" x2="17" y2="5" />
  </>);
}

/* ── Navigation & Layout Icons ────────────────── */

/** Dashboard / Grid */
export function DashboardIcon(props = {}) {
  return wrap(props, <>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </>);
}

/** Settings / Gear */
export function SettingsIcon(props = {}) {
  return wrap(props, <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>);
}

/** Menu Book */
export function MenuBookIcon(props = {}) {
  return wrap(props, <>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </>);
}

/** Logout / Sign Out */
export function LogoutIcon(props = {}) {
  return wrap(props, <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </>);
}

/* ── Inventory Icons ──────────────────────────── */

/** Plus */
export function PlusIcon(props = {}) {
  return wrap(props, <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>);
}

/** Minus */
export function MinusIcon(props = {}) {
  return wrap(props, <>
    <line x1="5" y1="12" x2="19" y2="12" />
  </>);
}

/** Check Circle — healthy stock */
export function CheckCircleIcon(props = {}) {
  return wrap(props, <>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </>);
}

/** X Circle — out of stock */
export function XCircleIcon(props = {}) {
  return wrap(props, <>
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </>);
}

/** Warning Circle — low stock */
export function WarningCircleIcon(props = {}) {
  return wrap(props, <>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </>);
}

/** Sync / Refresh Circle */
export function SyncIcon(props = {}) {
  return wrap(props, <>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </>);
}

/** Search */
export function SearchIcon(props = {}) {
  return wrap(props, <>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </>);
}

/** Filter */
export function FilterIcon(props = {}) {
  return wrap(props, <>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </>);
}

/** Chevron Down */
export function ChevronDownIcon(props = {}) {
  return wrap(props, <>
    <polyline points="6 9 12 15 18 9" />
  </>);
}

/** Arrow Up — stock increase */
export function ArrowUpIcon(props = {}) {
  return wrap(props, <>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </>);
}

/** Arrow Down — stock decrease */
export function ArrowDownIcon(props = {}) {
  return wrap(props, <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </>);
}

/** Trash */
export function TrashIcon(props = {}) {
  return wrap(props, <>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>);
}

