import { useState } from 'react'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip,
} from 'recharts'
import {
  TrendingUp, Shield, AlertTriangle, Target,
  BarChart3, DollarSign, Loader2, Users, Clock, FileText, Sparkles, Database,
} from 'lucide-react'

const PERIODS = [
  { label: '1W', days: 7, desc: '1 week' },
  { label: '2W', days: 14, desc: '2 weeks' },
  { label: '1M', days: 30, desc: '1 month' },
  { label: '3M', days: 90, desc: '3 months' },
  { label: '6M', days: 180, desc: '6 months' },
  { label: '1Y', days: 365, desc: '1 year' },
  { label: '2Y', days: 730, desc: '2 years' },
  { label: '5Y', days: 1825, desc: '5 years' },
]
const WEIGHT_MAP = {
  7: [80, 20], 14: [75, 25], 30: [65, 35], 90: [50, 50],
  180: [35, 65], 365: [25, 75], 730: [15, 85], 1825: [10, 90],
}
const TECH_LABELS = { trend: 'Trend', momentum: 'Momentum', volume: 'Volume', sr: 'S/R levels', volatility: 'Volatility' }
const FUND_LABELS = { growth: 'Growth', profitability: 'Profitability', balance: 'Balance sheet', cashflow: 'Cash flow', valuation: 'Valuation' }

function verdict(s) {
  if (s >= 80) return { t: 'STRONG BUY', c: 'text-emerald-700 bg-emerald-50 border-emerald-300' }
  if (s >= 60) return { t: 'BUY', c: 'text-emerald-600 bg-emerald-50 border-emerald-200' }
  if (s >= 40) return { t: 'HOLD', c: 'text-amber-600 bg-amber-50 border-amber-200' }
  if (s >= 20) return { t: 'CAUTION', c: 'text-orange-600 bg-orange-50 border-orange-200' }
  return { t: 'AVOID', c: 'text-red-600 bg-red-50 border-red-200' }
}
function fmt(v, prefix = '', suffix = '') { if (v == null) return '—'; return `${prefix}${typeof v === 'number' ? v.toLocaleString() : v}${suffix}` }
function fmtB(v, s='$') { if (!v) return '—'; if (Math.abs(v) >= 1e12) return `${s}${(v/1e12).toFixed(1)}T`; if (Math.abs(v) >= 1e9) return `${s}${(v/1e9).toFixed(1)}B`; if (Math.abs(v) >= 1e6) return `${s}${(v/1e6).toFixed(0)}M`; return `${s}${v.toLocaleString()}` }
function fmtCap(v, s='$') { return fmtB(v, s) }
function growthBadge(v) {
  if (v == null) return <span className="text-stone-300">—</span>
  const color = v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-stone-400'
  return <span className={`${color} font-medium`}>{v > 0 ? '+' : ''}{v}%</span>
}
function Metric({ label, value }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-stone-50 last:border-0">
      <span className="text-xs text-stone-400">{label}</span>
      <span className="text-xs font-mono text-stone-700">{value}</span>
    </div>
  )
}
function Card({ children, className = '' }) {
  return <div className={`bg-white border border-stone-100 rounded-xl p-3 sm:p-4 ${className}`}>{children}</div>
}
function ScoreBox({ label, value, icon: Icon }) {
  return (
    <div className="bg-stone-50 rounded-lg p-2.5 sm:p-3">
      <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-stone-400 mb-0.5">{Icon && <Icon size={12} />}{label}</div>
      <div className="text-base sm:text-lg font-semibold font-mono text-stone-800">{value}</div>
    </div>
  )
}
function RadarPanel({ title, data, labels, fill, stroke }) {
  const cd = Object.entries(labels).map(([k, l]) => ({ m: l, s: data?.[k]?.s ?? 0 }))
  return (
    <div>
      <div className="text-xs font-medium text-stone-400 mb-1">{title}</div>
      <Card>
        <ResponsiveContainer width="100%" height={180}>
          <RadarChart data={cd}>
            <PolarGrid stroke="#e7e5e4" />
            <PolarAngleAxis dataKey="m" tick={{ fontSize: 9, fill: '#78716c' }} />
            <PolarRadiusAxis angle={90} domain={[0, 20]} tick={{ fontSize: 7, fill: '#a8a29e' }} />
            <Radar dataKey="s" stroke={stroke} fill={fill} fillOpacity={0.2} strokeWidth={2} />
            <Tooltip formatter={v => [`${v}/20`]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e7e5e4' }} />
          </RadarChart>
        </ResponsiveContainer>
        <div className="space-y-0.5 mt-1">
          {Object.entries(labels).map(([k, l]) => {
            const s = data?.[k]?.s ?? 0, n = data?.[k]?.n || '', pct = (s / 20) * 100
            return (
              <div key={k} className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-[10px] sm:text-[11px] text-stone-400 w-20 sm:w-24 shrink-0">{l}</span>
                <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444' }} />
                </div>
                <span className="text-[10px] font-mono text-stone-500 w-7 text-right shrink-0">{s}</span>
                <span className="text-[9px] text-stone-300 hidden sm:block truncate max-w-[140px]">{n}</span>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
function SignalList({ title, items, color, icon: Icon }) {
  if (!items?.length) return null
  return (
    <div className={`border-l-[3px] ${color} pl-3`}>
      <div className="flex items-center gap-1 text-xs font-medium text-stone-600 mb-1"><Icon size={13} />{title}</div>
      {items.map((s, i) => <p key={i} className="text-[11px] text-stone-400 leading-relaxed">• {s}</p>)}
    </div>
  )
}

// ─── Section Divider ───
function SectionHeader({ icon: Icon, title, subtitle, accent }) {
  return (
    <div className={`flex items-center gap-2.5 pt-5 pb-2 border-t ${accent ? 'border-indigo-200' : 'border-stone-200'}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? '' : 'bg-stone-100'}`}
        style={accent ? {background:'linear-gradient(135deg,#c7d2fe,#a5b4fc)'} : {}}>
        <Icon size={15} className={accent ? 'text-indigo-700' : 'text-stone-500'} />
      </div>
      <div>
        <div className={`text-sm font-semibold ${accent ? 'text-indigo-800' : 'text-stone-700'}`}>{title}</div>
        {subtitle && <div className={`text-[10px] ${accent ? 'text-indigo-400' : 'text-stone-400'}`}>{subtitle}</div>}
      </div>
    </div>
  )
}

// ─── Income Statement ───
function IncomeSection({ is, currencySymbol='$' }) {
  if (!is || !is.revenue) return null
  const rows = [
    { label: 'Revenue', cur: is.revenue, prior: is.revenuePrior, g: is.revenueGrowth },
    { label: 'COGS', cur: is.cogs, prior: is.cogsPrior, g: is.cogsGrowth },
    { label: 'Gross profit', cur: is.grossProfit, prior: is.grossProfitPrior, g: is.grossProfitGrowth, bold: true },
    { label: 'R&D', cur: is.rd, prior: is.rdPrior, g: is.rdGrowth },
    { label: 'SG&A', cur: is.sga, prior: is.sgaPrior, g: is.sgaGrowth },
    { label: 'Total OpEx', cur: is.opex, prior: is.opexPrior, g: is.opexGrowth },
    { label: 'Op income', cur: is.opIncome, prior: is.opIncomePrior, g: is.opIncomeGrowth },
    { label: 'EBITDA', cur: is.ebitda, prior: is.ebitdaPrior, g: is.ebitdaGrowth },
    { label: 'Net income', cur: is.netIncome, prior: is.netIncomePrior, g: is.netIncomeGrowth, bold: true },
  ]
  return (
    <Card>
      <div className="flex items-center gap-1 text-xs font-medium text-stone-600 mb-2">
        <FileText size={13} />Income statement (annual)
      </div>
      <div className="overflow-x-auto -mx-3 sm:-mx-4 px-3 sm:px-4">
        <table className="w-full text-[11px] sm:text-xs min-w-[400px]">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="text-left py-1.5 px-1.5 font-medium text-stone-400">Item</th>
              <th className="text-right py-1.5 px-1.5 font-medium text-stone-400">FY{is.fiscalYear}</th>
              <th className="text-right py-1.5 px-1.5 font-medium text-stone-400">FY{is.priorYear}</th>
              <th className="text-right py-1.5 px-1.5 font-medium text-stone-400">YoY %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-stone-50 ${r.bold ? 'bg-stone-50/50' : ''}`}>
                <td className={`py-1.5 px-1.5 text-stone-600 ${r.bold ? 'font-semibold' : ''}`}>{r.label}</td>
                <td className="py-1.5 px-1.5 text-right font-mono text-stone-700">{fmtB(r.cur, currencySymbol)}</td>
                <td className="py-1.5 px-1.5 text-right font-mono text-stone-400">{fmtB(r.prior, currencySymbol)}</td>
                <td className="py-1.5 px-1.5 text-right font-mono">{growthBadge(r.g)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── Peers Table ───
function PeersTable({ raw, peers, peersAvg, loading, currencySymbol='$' }) {
  const cols = [
    { key: 'ticker', label: 'Ticker' },
    { key: 'marketCap', label: 'Mkt cap', fmt: v => fmtCap(v, currencySymbol) },
    { key: 'pe', label: 'P/E', fmt: v => fmt(v, '', 'x'), lower: true },
    { key: 'evEbitda', label: 'EV/EB', fmt: v => fmt(v, '', 'x'), lower: true },
    { key: 'roe', label: 'ROE', fmt: v => fmt(v, '', '%'), lower: false },
    { key: 'netMargin', label: 'Net %', fmt: v => fmt(v, '', '%'), lower: false },
    { key: 'deRatio', label: 'D/E', fmt: v => fmt(v), lower: true },
    { key: 'dividendYield', label: 'Div %', fmt: v => fmt(v, '', '%'), lower: false },
  ]
  const selfRow = {
    ticker: raw.ticker, marketCap: raw.marketCap, pe: raw.pe,
    evEbitda: raw.evEbitda, roe: raw.roe, netMargin: raw.netMargin,
    deRatio: raw.deRatio, dividendYield: raw.dividendYield, _self: true,
  }
  const allRows = [selfRow, ...(peers || [])]
  const best = {}
  cols.forEach(c => {
    if (c.key === 'ticker' || c.key === 'marketCap') return
    const vals = allRows.map(r => r[c.key]).filter(v => v != null && v > 0)
    if (vals.length) best[c.key] = c.lower ? Math.min(...vals) : Math.max(...vals)
  })

  return (
    <div>
      <div className="flex items-center gap-1 text-xs font-medium text-stone-600 mb-3">
        <Users size={13} />Industry peers{raw.sector ? ` — ${raw.sector}` : ''}
      </div>
      {loading && (
        <div className="flex flex-col items-center gap-2 py-8 justify-center">
          <div className="flex gap-1">
            <div className="w-1.5 h-6 rounded-full bg-stone-200 animate-pulse" style={{animationDelay:'0ms'}} />
            <div className="w-1.5 h-8 rounded-full bg-stone-300 animate-pulse" style={{animationDelay:'100ms'}} />
            <div className="w-1.5 h-5 rounded-full bg-stone-200 animate-pulse" style={{animationDelay:'200ms'}} />
            <div className="w-1.5 h-7 rounded-full bg-stone-300 animate-pulse" style={{animationDelay:'300ms'}} />
            <div className="w-1.5 h-4 rounded-full bg-stone-200 animate-pulse" style={{animationDelay:'400ms'}} />
          </div>
          <span className="text-xs text-stone-400">Loading industry peers...</span>
        </div>
      )}
      {!loading && (!peers || peers.length === 0) && (
        <p className="text-xs text-stone-300 py-4 text-center">No peer data available.</p>
      )}
      {!loading && peers && peers.length > 0 && (
        <>
          <div className="overflow-x-auto -mx-3 sm:-mx-4 px-3 sm:px-4">
            <table className="w-full text-[11px] sm:text-xs min-w-[520px]">
              <thead>
                <tr className="border-b border-stone-200">
                  {cols.map(c => <th key={c.key} className="text-left py-2 px-1.5 sm:px-2 font-medium text-stone-400 whitespace-nowrap">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-blue-50/60 border-b border-stone-100">
                  {cols.map(c => {
                    const val = selfRow[c.key]
                    const isBest = c.key !== 'ticker' && c.key !== 'marketCap' && val != null && val === best[c.key]
                    return (
                      <td key={c.key} className={`py-1.5 px-1.5 sm:px-2 font-mono whitespace-nowrap ${c.key === 'ticker' ? 'font-semibold text-blue-600' : ''} ${isBest ? 'text-emerald-600 font-medium' : 'text-stone-600'}`}>
                        {c.key === 'ticker' ? `${val} ★` : c.fmt(val)}
                      </td>
                    )
                  })}
                </tr>
                {peersAvg && Object.keys(peersAvg).length > 0 && (
                  <tr className="bg-amber-50/40 border-b border-stone-100">
                    {cols.map(c => (
                      <td key={c.key} className="py-1.5 px-1.5 sm:px-2 font-mono whitespace-nowrap text-amber-700 text-[10px]">
                        {c.key === 'ticker' ? 'Avg ⌀' : c.key === 'marketCap' ? '—' : c.fmt(peersAvg[c.key])}
                      </td>
                    ))}
                  </tr>
                )}
                {peers.map((row, i) => (
                  <tr key={i} className="border-b border-stone-50">
                    {cols.map(c => {
                      const val = row[c.key]
                      const isBest = c.key !== 'ticker' && c.key !== 'marketCap' && val != null && val === best[c.key]
                      return (
                        <td key={c.key} className={`py-1.5 px-1.5 sm:px-2 font-mono whitespace-nowrap ${isBest ? 'text-emerald-600 font-medium' : 'text-stone-600'}`}>
                          {c.key === 'ticker' ? val : c.fmt(val)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[9px] sm:text-[10px] text-stone-300 mt-2">★ analyzed stock · ⌀ industry avg · green = best in group</p>
        </>
      )}
    </div>
  )
}

// ─── Main Dashboard ───
export default function Dashboard({ raw, ai, aiLoading, peers, peersAvg, peersLoading, periodDays, onPeriodChange }) {
  const w = WEIGHT_MAP[periodDays] || [50, 50]
  const activePeriod = PERIODS.find(p => p.days === periodDays)
  const sym = raw.currencySymbol || '$'

  return (
    <div className="space-y-4">

      {/* ══ HEADER ══ */}
      <div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xl sm:text-2xl font-bold text-stone-800 font-mono">{raw.ticker}</span>
          <span className="text-[10px] sm:text-[11px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded font-medium">
            {raw.flag && <span className="mr-0.5">{raw.flag}</span>}{raw.market || raw.exchange}
          </span>
          {raw._source === 'claude' && (
            <span className="text-[10px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded font-medium">via AI search</span>
          )}
          {raw._source === 'yahoo' && (
            <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-medium">Yahoo Finance</span>
          )}
          {raw.sector && <span className="text-[10px] sm:text-[11px] text-stone-400">{raw.sector}</span>}
        </div>
        <div className="text-xs sm:text-sm text-stone-400">{raw.name}</div>
        <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
          <span className="text-base sm:text-lg font-semibold text-stone-800">{sym}{raw.price?.toFixed(2)}</span>
          {raw.change != null && (
            <span className={`text-[11px] sm:text-xs font-medium ${raw.change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {raw.change >= 0 ? '+' : ''}{raw.change?.toFixed(2)} ({raw.changePercent >= 0 ? '+' : ''}{raw.changePercent?.toFixed(2)}%)
            </span>
          )}
          {raw.change != null && (
            <span className="text-[10px] text-stone-400">vs prev close</span>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* SECTION A: Market data                      */}
      {/* ════════════════════════════════════════════ */}
      <SectionHeader icon={Database} title="Market data" subtitle="Real-time financial metrics from market data providers" />
      {raw._aiEstimate && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <span className="text-amber-500 mt-0.5 text-sm">⚠️</span>
          <div>
            <span className="text-[11px] font-semibold text-amber-700">Fundamental data is AI-estimated</span>
            <p className="text-[10px] text-amber-600 mt-0.5">Price &amp; 52W range are from Yahoo Finance (real-time). Ratios (PE, ROE, margins etc.) are estimated from Claude AI training data — may not be fully accurate. Use for reference only.</p>
          </div>
        </div>
      )}

      {/* 1. KEY METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Card>
          <div className="text-[9px] sm:text-[10px] font-medium text-stone-300 mb-1">VALUATION</div>
          <Metric label="P/E" value={fmt(raw.pe, '', 'x')} />
          <Metric label="P/B" value={fmt(raw.pb, '', 'x')} />
          <Metric label="EV/EBITDA" value={fmt(raw.evEbitda, '', 'x')} />
          <Metric label="P/FCF" value={fmt(raw.pFcf, '', 'x')} />
          <Metric label="EPS" value={fmt(raw.eps, sym)} />
        </Card>
        <Card>
          <div className="text-[9px] sm:text-[10px] font-medium text-stone-300 mb-1">DIVIDEND & RETURNS</div>
          <Metric label="Div yield" value={fmt(raw.dividendYield, '', '%')} />
          <Metric label="Payout" value={fmt(raw.payoutRatio, '', '%')} />
          <Metric label="ROE" value={fmt(raw.roe, '', '%')} />
          <Metric label="ROA" value={fmt(raw.roa, '', '%')} />
          <Metric label="ROIC" value={fmt(raw.roic, '', '%')} />
        </Card>
        <Card>
          <div className="text-[9px] sm:text-[10px] font-medium text-stone-300 mb-1">MARGINS & CASH FLOW</div>
          <Metric label="Gross" value={fmt(raw.grossMargin, '', '%')} />
          <Metric label="Operating" value={fmt(raw.opMargin, '', '%')} />
          <Metric label="Net" value={fmt(raw.netMargin, '', '%')} />
          <Metric label="FCF/share" value={fmt(raw.fcfPerShare, sym)} />
          <Metric label="FCF yield" value={fmt(raw.fcfYield, '', '%')} />
        </Card>
        <Card>
          <div className="text-[9px] sm:text-[10px] font-medium text-stone-300 mb-1">BALANCE & PRICE</div>
          <Metric label="D/E" value={fmt(raw.deRatio)} />
          <Metric label="Current" value={fmt(raw.currentRatio)} />
          <Metric label="52w H" value={fmt(raw.high52, sym)} />
          <Metric label="52w L" value={fmt(raw.low52, sym)} />
          <Metric label="Beta" value={fmt(raw.beta)} />
        </Card>
      </div>

      {/* 1.5 INCOME STATEMENT */}
      <IncomeSection is={raw.incomeStatement} currencySymbol={sym} />

      {/* 2. INDUSTRY PEERS — hide when loaded but empty */}
      {(peersLoading || (peers && peers.length > 0)) && (
        <Card>
          <PeersTable raw={raw} peers={peers} peersAvg={peersAvg} loading={peersLoading} currencySymbol={sym} />
        </Card>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* SECTION B: AI-Powered Analysis               */}
      {/* ════════════════════════════════════════════ */}
      <SectionHeader
        icon={Sparkles}
        title="AI-powered analysis"
        subtitle="Scoring and insights powered by Claude AI"
        accent
      />

      {/* 3. PERIOD SELECTOR */}
      <Card className="border-indigo-50">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
          <div className="flex items-center gap-1">
            <Clock size={13} className="text-indigo-400" />
            <span className="text-xs font-medium text-indigo-700">Investment period</span>
          </div>
          <span className="text-[10px] sm:text-[11px] text-stone-400">{activePeriod?.desc} — {w[0]}% tech / {w[1]}% fund</span>
        </div>
        <div className="grid grid-cols-4 sm:flex gap-1.5">
          {PERIODS.map(p => (
            <button key={p.days} onClick={() => onPeriodChange(p.days)}
              className={`px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-all text-center ${
                periodDays === p.days ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-400 hover:bg-indigo-100'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      {/* 4 & 5. AI SCORING */}
      {aiLoading && (
        <div className="flex flex-col items-center py-10 justify-center">
          <div className="relative mb-4">
            <div className="w-14 h-14 rounded-full border-indigo-100 border-t-indigo-500 animate-spin" style={{borderWidth:'3px',borderStyle:'solid'}} />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-lg">
              <span className="animate-pulse">AI</span>
            </div>
          </div>
          <p className="text-indigo-600 text-sm font-medium">Claude AI is analyzing {raw.ticker}</p>
          <p className="text-indigo-300 text-xs mt-1">Scoring for {activePeriod?.desc} period...</p>
          <div className="flex gap-3 mt-4">
            <div className="flex items-center gap-1 text-[10px] text-indigo-300">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />Technical
            </div>
            <div className="flex items-center gap-1 text-[10px] text-indigo-300">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" style={{animationDelay:'500ms'}} />Fundamental
            </div>
            <div className="flex items-center gap-1 text-[10px] text-indigo-300">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" style={{animationDelay:'1000ms'}} />Verdict
            </div>
          </div>
        </div>
      )}

      {!ai && !aiLoading && (
        <div className="flex flex-col items-center py-8 text-center">
          <AlertTriangle size={20} className="text-amber-400 mb-2" />
          <p className="text-stone-500 text-xs">AI scoring unavailable. Check Anthropic API credit or try again.</p>
          <button onClick={() => onPeriodChange(periodDays)}
            className="mt-2 px-3 py-1 text-xs bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100">
            Retry scoring
          </button>
        </div>
      )}

      {ai && !aiLoading && (
        <>
          {/* 4. Radar charts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <RadarPanel title="Technical breakdown" data={ai.technical} labels={TECH_LABELS} fill="#6366f1" stroke="#4f46e5" />
            <RadarPanel title="Fundamental breakdown" data={ai.fundamental} labels={FUND_LABELS} fill="#14b8a6" stroke="#0d9488" />
          </div>

          {/* 5. Scoring */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <ScoreBox label="Technical" value={`${ai.tT}/100`} icon={BarChart3} />
            <ScoreBox label="Fundamental" value={`${ai.fT}/100`} icon={DollarSign} />
            <ScoreBox label="Weighted" value={`${ai.wS}/100`} icon={Target} />
            <div className={`rounded-lg p-2.5 sm:p-3 border ${verdict(ai.wS).c} flex flex-col items-center justify-center`}>
              <div className="text-[10px] sm:text-[11px] text-stone-400">Verdict</div>
              <div className="text-sm sm:text-base font-bold">{verdict(ai.wS).t}</div>
            </div>
          </div>

          {/* Weight bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden flex">
              <div className="h-full bg-indigo-400 rounded-l-full transition-all duration-500" style={{ width: `${ai.wT || w[0]}%` }} />
              <div className="h-full bg-teal-400 rounded-r-full transition-all duration-500" style={{ width: `${ai.wF || w[1]}%` }} />
            </div>
            <span className="text-[10px] sm:text-[11px] text-stone-400">
              <span className="text-indigo-500 font-medium">{ai.wT || w[0]}%</span> T / <span className="text-teal-500 font-medium">{ai.wF || w[1]}%</span> F
            </span>
          </div>

          {/* Signals + Risks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SignalList title="Key signals" items={ai.signals} color="border-emerald-400" icon={TrendingUp} />
            <SignalList title="Risks" items={ai.risks} color="border-red-300" icon={AlertTriangle} />
          </div>

          {/* Trade setup */}
          {ai.entry && (
            <Card className="border-indigo-50">
              <div className="flex items-center gap-1 text-xs font-medium text-indigo-700 mb-2"><Shield size={13} />Trade setup</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div><span className="text-stone-400">Entry</span><div className="font-mono text-stone-700">{ai.entry}</div></div>
                <div><span className="text-stone-400">Stop loss</span><div className="font-mono text-red-500">{ai.stop}</div></div>
                {ai.targets?.map((t, i) => (
                  <div key={i}><span className="text-stone-400">Target {i + 1}</span><div className="font-mono text-emerald-600">{t}</div></div>
                ))}
              </div>
            </Card>
          )}

          {/* Powered by badge */}
          <div className="flex items-center justify-center gap-1.5 pt-2">
            <Sparkles size={12} className="text-indigo-300" />
            <span className="text-[10px] text-indigo-300">Powered by Claude AI · Anthropic</span>
          </div>
        </>
      )}
    </div>
  )
}
