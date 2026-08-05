'use client';

// ─────────────────────────────────────────────────────────────
// Concordia College — Recharts wrappers for dashboard analytics
//
// Lightweight, responsive chart components that use the already-
// installed `recharts` library. All charts use the Concordia
// orange brand color as the primary accent.
// ─────────────────────────────────────────────────────────────

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';

const BRAND_ORANGE = '#F26522';
const BRAND_ORANGE_LIGHT = 'rgba(242, 101, 34, 0.2)';
const COLORS = ['#F26522', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

// ── Bar Chart (e.g. monthly collection, enrollments per month) ──
export function SimpleBarChart(props: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  yLabel?: string;
  formatValue?: (v: number) => string;
}) {
  const { data, height = 220, color = BRAND_ORANGE, yLabel, formatValue } = props;
  const gradientId = `bar-gradient-${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={1} />
            <stop offset="100%" stopColor={color} stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} className="fill-muted-foreground" axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} className="fill-muted-foreground" axisLine={false} tickLine={false} width={48} allowDecimals={false} domain={[0, 'auto']} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: 'currentColor' } } : undefined} />
        <Tooltip
          cursor={{ fill: BRAND_ORANGE_LIGHT }}
          contentStyle={{ borderRadius: 8, border: '1px solid rgba(128,128,128,0.2)', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', background: 'var(--popover)', color: 'var(--popover-foreground)' }}
          formatter={(v: number) => formatValue ? formatValue(v) : v}
        />
        <Bar dataKey="value" fill={`url(#${gradientId})`} radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Line Chart (e.g. trends over time) ──
export function SimpleLineChart(props: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const { data, height = 220, color = BRAND_ORANGE, formatValue } = props;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={48} allowDecimals={false} domain={[0, 'auto']} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          formatter={(v: number) => formatValue ? formatValue(v) : v}
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ fill: color, r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Pie / Donut Chart (e.g. enrollment by program) ──
export function SimplePieChart(props: {
  data: { label: string; value: number }[];
  height?: number;
  donut?: boolean;
}) {
  const { data, height = 220, donut = true } = props;
  const filtered = data.filter(d => d.value > 0);
  if (filtered.length === 0) return null;
  const total = filtered.reduce((sum, d) => sum + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={filtered}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={donut ? 50 : 0}
          outerRadius={80}
          paddingAngle={2}
          label={({ value }: { value?: number }) => (value ? `${value}` : '')}
          labelLine={false}
        >
          {filtered.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
          {donut && (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-gray-900"
              style={{ fontSize: 22, fontWeight: 700 }}
            >
              {total}
            </text>
          )}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Chart Card wrapper ──
export function ChartCard(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { title, subtitle, children, className = '' } = props;
  return (
    <div className={`group rounded-xl border border-border bg-card p-4 sm:p-5 transition-shadow hover:shadow-md ${className}`}>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
