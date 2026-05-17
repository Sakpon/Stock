import { useState, useCallback, useEffect } from 'react'
import Dashboard from './Dashboard'
import PortfolioConsult from './PortfolioConsult'
import StatsPage from './StatsPage'
import { Search, Loader2, AlertCircle, BarChart3, Globe, TrendingUp, Shield, Flame, Sparkles, Briefcase, ChevronRight, Zap } from 'lucide-react'
import { API } from './config'

const QUICK_US = ['AAPL','MSFT','NVDA','GOOGL','TSLA']
const QUICK_TH = ['PTT','KBANK','DELTA','CPALL','AOT']
const QUICK_HK = ['0700','9988','1211','0005','3690']

const MARKETS = [
  { id: 'US',  flag: '🇺🇸', label: 'US',  suffix: '',    placeholder: 'e.g. AAPL, MSFT' },
  { id: 'SET', flag: '🇹🇭', label: 'SET', suffix: '.BK', placeholder: 'e.g. PTT, KBANK' },
  { id: 'HK',  flag: '🇭🇰', label: 'HK',  suffix: '.HK', placeholder: 'e.g. 0700, 9988' },
]

function normalizeHKCode(t) {
  // HK codes are numeric: strip extra leading zeros, then pad to 4 digits
  // e.g. "01211" → "1211", "0700" → "0700", "9988" → "9988"
  const num = parseInt(t, 10)
  if (isNaN(num)) return t
  return String(num).padStart(4, '0')
}

function buildFullTicker(input, marketId) {
  const t = (input || '').trim().toUpperCase()
  if (!t) return ''
  // If user already typed a suffix, respect it
  if (t.endsWith('.BK') || t.endsWith('.HK')) return t
  if (marketId === 'SET') return t + '.BK'
  if (marketId === 'HK')  return normalizeHKCode(t) + '.HK'
  return t
}
function getMarketInfo(ticker) {
  const t = (ticker || '').toUpperCase()
  if (t.endsWith('.BK')) return { market: 'SET', flag: '🇹🇭', currencySymbol: '฿', label: 'Thailand SET' }
  if (t.endsWith('.HK')) return { market: 'HKEX', flag: '🇭🇰', currencySymbol: 'HK$', label: 'Hong Kong HKEX' }
  return { market: 'US', flag: '🇺🇸', currencySymbol: '$', label: 'NYSE / NASDAQ' }
}

function trimMetrics(data) {
  return {
    price: data.price, pe: data.pe, pb: data.pb, evEbitda: data.evEbitda,
    roe: data.roe, roa: data.roa, netMargin: data.netMargin,
    grossMargin: data.grossMargin, opMargin: data.opMargin,
    deRatio: data.deRatio, currentRatio: data.currentRatio,
    fcfPerShare: data.fcfPerShare, dividendYield: data.dividendYield,
    high52: data.high52, low52: data.low52, beta: data.beta,
    sector: data.sector,
  }
}

async function callAnalyze(sym, metrics, days) {
  const r = await fetch(API + '/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker: sym, metrics, periodDays: days }),
  })
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  return d
}

const RISK_CONFIG = {
  aggressive:   { label: 'High Risk',  icon: Flame,     bar: 'bg-rose-500',    bg: 'bg-rose-50',    border: 'border-rose-100',   text: 'text-rose-600',   badge: 'bg-rose-100 text-rose-600',   accent: '#f43f5e' },
  balanced:     { label: 'Balanced',   icon: TrendingUp, bar: 'bg-amber-400',   bg: 'bg-amber-50',   border: 'border-amber-100',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700', accent: '#f59e0b' },
  conservative: { label: 'Low Risk',   icon: Shield,     bar: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-100',text: 'text-emerald-700',badge: 'bg-emerald-100 text-emerald-700', accent: '#10b981' },
}

function PickCard({ pick, livePrice, onAnalyze }) {
  const rc = RISK_CONFIG[pick.risk] || RISK_CONFIG.balanced
  const Icon = rc.icon
  const displayPrice = livePrice?.price ?? pick.price
  const displayPct   = livePrice?.changePercent ?? pick.changePercent
  const isUp = displayPct >= 0
  return (
    <button onClick={() => onAnalyze(pick.ticker)}
      className={`group relative flex flex-col w-full rounded-2xl border ${rc.border} ${rc.bg} p-4 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]`}>
      {/* Top row: market flag + risk badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-base">{pick.flag || '🇺🇸'}</span>
          <span className="text-[10px] font-semibold text-stone-400 tracking-wide uppercase">{pick.market || 'US'}</span>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${rc.badge}`}>
          <Icon size={9} /> {rc.label}
        </span>
      </div>
      {/* Ticker + % change */}
      <div className="flex items-baseline gap-2 mb-0.5">
        <span className="text-lg font-bold text-stone-900 tracking-tight">{pick.emoji} {pick.ticker?.replace(/\.(BK|HK)$/i,'')}</span>
        {displayPct != null && (
          <span className={`text-xs font-bold ${isUp ? 'text-emerald-600' : 'text-rose-500'}`}>
            {isUp ? '▲' : '▼'} {Math.abs(displayPct).toFixed(1)}%
          </span>
        )}
      </div>
      {/* Company name */}
      <p className="text-[11px] text-stone-400 truncate mb-2">{pick.name}</p>
      {/* Price */}
      <p className="text-xl font-bold text-stone-800 mb-2">
        {displayPrice != null
          ? `${pick.currencySymbol || '$'}${Number(displayPrice).toLocaleString()}`
          : <span className="text-sm text-stone-300 animate-pulse">—</span>}
      </p>
      {/* Reason */}
      <p className={`text-[11px] ${rc.text} font-medium leading-relaxed line-clamp-2 mb-3`}>{pick.reason}</p>
      {/* CTA */}
      <div className="flex items-center gap-1 mt-auto text-[11px] font-semibold text-slate-500 group-hover:text-slate-700 transition-colors">
        View Analysis <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
      </div>
    </button>
  )
}

function validateTicker(input, marketId) {
  const t = (input || '').trim().replace(/\.(BK|HK)$/i, '')
  if (!t) return null
  if (marketId === 'HK') {
    if (!/^\d{1,5}$/.test(t)) return 'HK tickers are numbers only (e.g. 0700, 9988)'
  } else if (marketId === 'SET') {
    if (!/^[A-Z0-9]{1,8}$/.test(t)) return 'SET tickers use letters (e.g. PTT, KBANK, DELTA)'
  } else {
    if (!/^[A-Z.]{1,6}$/.test(t)) return 'US tickers use letters (e.g. AAPL, MSFT, BRK.B)'
  }
  return null
}

export default function App() {
  const [tab, setTab] = useState('analyze') // 'analyze' | 'consult'
  const [ticker, setTicker] = useState('')
  const [selectedMarket, setSelectedMarket] = useState('US')
  const [raw, setRaw] = useState(null)
  const [ai, setAi] = useState(null)
  const [peers, setPeers] = useState(null)
  const [peersAvg, setPeersAvg] = useState({})
  const [periodDays, setPeriodDays] = useState(90)
  const [loading1, setLoading1] = useState(false)
  const [loading2, setLoading2] = useState(false)
  const [loadingPeers, setLoadingPeers] = useState(false)
  const [error, setError] = useState(null)
  const [errorType, setErrorType] = useState(null)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [picks, setPicks] = useState(null)
  const [picksLoading, setPicksLoading] = useState(false)
  const [picksDate, setPicksDate] = useState(null)
  const [pickPrices, setPickPrices] = useState({}) // { ticker: { price, changePercent } }

  useEffect(() => {
    setPicksLoading(true)
    fetch(API + '/api/picks')
      .then(r => r.json())
      .then(d => {
        if (d.picks && d.picks.length) {
          setPicks(d.picks)
          setPicksDate(d.date)
          // Fetch live price for each pick in parallel
          d.picks.forEach(pick => {
            fetch(API + '/api/data', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticker: pick.ticker }),
            })
              .then(r => r.json())
              .then(data => {
                if (data.price) {
                  setPickPrices(prev => ({
                    ...prev,
                    [pick.ticker]: { price: data.price, changePercent: data.changePercent }
                  }))
                }
              })
              .catch(() => {})
          })
        }
      })
      .catch(() => {})
      .finally(() => setPicksLoading(false))
  }, [])

  const fetchAI = useCallback(async (sym, data, days) => {
    setAi(null); setLoading2(true)
    const metrics = trimMetrics(data)
    try {
      const result = await callAnalyze(sym, metrics, days)
      setAi(result)
    } catch {
      await new Promise(r => setTimeout(r, 1000))
      try { const result = await callAnalyze(sym, metrics, days); setAi(result) } catch { }
    }
    setLoading2(false)
  }, [])

  const analyze = useCallback(async (t, days) => {
    const raw_input = t || ticker
    const sym = buildFullTicker(raw_input, selectedMarket)
    if (!sym) return
    setTab('analyze')
    const pd = days || periodDays
    setTicker(sym); setPeriodDays(pd)
    setRaw(null); setAi(null); setPeers(null); setPeersAvg({}); setError(null); setErrorType(null)
    setLoading1(true); setLoading2(true); setLoadingPeers(true)
    setLoadingMsg(`Fetching ${sym} from market data...`)

    try {
      const r1 = await fetch(API + '/api/data', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: sym }),
      })
      let data = await r1.json()

      if (!r1.ok || data.error) {
        setLoadingMsg(`${sym} not in free data — AI searching...`)
        let fallbackData = null
        for (let attempt = 1; attempt <= 2; attempt++) {
          const r2 = await fetch(API + '/api/fallback', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: sym }),
          })
          const d2 = await r2.json()
          if (!d2.error) { fallbackData = d2; break }
          if (attempt === 1) { setLoadingMsg(`Retrying AI search for ${sym}...`); await new Promise(r => setTimeout(r, 500)) }
        }
        if (!fallbackData) { setErrorType('timeout'); throw new Error('AI search timed out.') }
        data = fallbackData
      }

      setRaw(data); setLoading1(false)
      fetchAI(sym, data, pd)

      fetch(API + '/api/peers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: sym, sector: data.sector, marketCap: data.marketCap }),
      }).then(r => r.json())
        .then(d => { setPeers(d.peers || []); setPeersAvg(d.avg || {}) })
        .catch(() => { setPeers([]); setPeersAvg({}) })
        .finally(() => setLoadingPeers(false))
    } catch (e) {
      setError(e.message)
      if (!errorType) setErrorType('unknown')
      setLoading1(false); setLoading2(false); setLoadingPeers(false)
    }
  }, [ticker, selectedMarket, periodDays, fetchAI, errorType])

  const onPeriodChange = useCallback((days) => {
    setPeriodDays(days)
    if (raw) fetchAI(raw.ticker, raw, days)
  }, [raw, fetchAI])

  const showLanding = tab === 'analyze' && !raw && !loading1 && !error

  // Simple ?stats route
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('stats') !== null) {
    return <StatsPage />
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-50 bg-[#0f172a] border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4">
          {/* Top bar */}
          <div className="flex items-center gap-2 py-2">
            {/* Logo — click to go home */}
            <button onClick={() => { setTab('analyze'); setRaw(null); setError(null); setTicker('') }}
              className="shrink-0 flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center">
                <BarChart3 size={16} className="text-white" />
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-white text-sm font-bold leading-tight tracking-tight">StockAI</p>
                <p className="text-slate-500 text-[10px] flex items-center gap-1"><Globe size={8} />Global Markets</p>
              </div>
            </button>

            {/* Search — full width on mobile */}
            {tab === 'analyze' && (
              <div className="flex flex-1 flex-col gap-1 min-w-0">
                {/* Market selector */}
                <div className="flex items-center rounded-lg border border-white/10 overflow-hidden w-full" style={{background:'rgba(255,255,255,0.07)'}}>
                  {MARKETS.map(m => (
                    <button key={m.id} onClick={() => { setSelectedMarket(m.id); setTicker('') }}
                      disabled={loading1}
                      className={`flex-1 py-1 text-[11px] font-bold transition-all whitespace-nowrap text-center ${
                        selectedMarket === m.id ? 'bg-white/20 text-white' : 'text-slate-500 hover:text-slate-300'
                      }`}>
                      {m.flag} {m.label}
                    </button>
                  ))}
                </div>
                {/* Input + button */}
                {(() => {
                  const tickerErr = validateTicker(ticker, selectedMarket)
                  const isInvalid = !!tickerErr
                  return (
                    <div className="flex flex-col gap-0.5">
                      <div className={`flex items-center rounded-lg border overflow-hidden w-full transition-colors ${isInvalid ? 'border-rose-500/70' : 'border-white/10'}`} style={{background:'rgba(255,255,255,0.07)'}}>
                        <Search size={13} className={`shrink-0 ml-2.5 ${isInvalid ? 'text-rose-400' : 'text-slate-500'}`} />
                        <input type="text" value={ticker}
                          onChange={e => setTicker(e.target.value.toUpperCase())}
                          onKeyDown={e => e.key === 'Enter' && !isInvalid && analyze()}
                          placeholder={MARKETS.find(m => m.id === selectedMarket)?.placeholder}
                          className="flex-1 min-w-0 px-2 py-1.5 text-sm bg-transparent font-mono placeholder:font-sans placeholder:text-slate-600 text-white focus:outline-none"
                          disabled={loading1} />
                        <button onClick={() => analyze()} disabled={loading1 || !ticker.trim() || isInvalid}
                          className="shrink-0 px-3 py-1.5 text-xs font-bold bg-blue-500 hover:bg-blue-400 disabled:opacity-30 text-white transition-all active:scale-95 flex items-center gap-1 border-l border-white/10">
                          {loading1 ? <Loader2 size={13} className="animate-spin" /> : <><Zap size={12} /><span className="hidden sm:inline">Analyze</span><span className="sm:hidden">Go</span></>}
                        </button>
                      </div>
                      {isInvalid && (
                        <p className="text-[10px] text-rose-400 px-1">{tickerErr}</p>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
            {tab === 'consult' && (
              <div className="flex-1 min-w-0 flex items-center gap-2 px-1">
                <div className="w-px h-6 bg-white/10 shrink-0" />
                <div className="min-w-0">
                  <p className="text-white text-xs font-bold leading-tight">Portfolio Analysis</p>
                  <p className="text-slate-500 text-[10px] truncate">AI-powered portfolio review &amp; recommendations</p>
                </div>
                <div className="ml-auto hidden sm:flex items-center gap-3 text-[10px] text-slate-600 shrink-0">
                  <span className="flex items-center gap-1"><span className="text-emerald-500">✓</span> Goal setting</span>
                  <span className="flex items-center gap-1"><span className="text-emerald-500">✓</span> Risk analysis</span>
                  <span className="flex items-center gap-1"><span className="text-emerald-500">✓</span> Stock picks</span>
                </div>
              </div>
            )}

            {/* Back link — desktop only */}
            <a href="https://pokproject.com"
              className="shrink-0 text-[10px] text-slate-600 hover:text-slate-300 transition-colors whitespace-nowrap hidden sm:block">
              ← pokproject.com
            </a>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0 -mb-px">
            <button onClick={() => { setTab('analyze'); setRaw(null); setError(null) }}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold tracking-wide transition-all border-b-2 ${
                tab === 'analyze'
                  ? 'text-blue-400 border-blue-500'
                  : 'text-slate-600 border-transparent hover:text-slate-300'
              }`}>
              <BarChart3 size={14} /> Stock Analysis
            </button>
            <button onClick={() => { setTab('consult'); setRaw(null); setError(null) }}
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold tracking-wide transition-all border-b-2 ${
                tab === 'consult'
                  ? 'text-blue-400 border-blue-500'
                  : 'text-slate-600 border-transparent hover:text-slate-300'
              }`}>
              <Briefcase size={14} /> Portfolio Analysis
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 pb-24">
        {/* ══ TAB: ANALYZE ══ */}
        {tab === 'analyze' && (
          <>
            {/* Landing */}
            {showLanding && (
              <div className="pt-2 pb-6">

                {/* AI Picks Section */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Sparkles size={14} className="text-blue-500" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-800">AI Picks Today</h2>
                        {picksDate && <p className="text-[10px] text-slate-400">{picksDate} · 🇺🇸 US · 🇹🇭 SET · 🇭🇰 HKEX</p>}
                      </div>
                    </div>
                    {picksLoading && <Loader2 size={14} className="animate-spin text-slate-400" />}
                  </div>

                  {picksLoading && !picks && (
                    <div className="flex gap-3 overflow-hidden">
                      {[1,2,3].map(i => (
                        <div key={i} className="shrink-0 w-[200px] h-[200px] rounded-2xl bg-slate-200 animate-pulse" />
                      ))}
                    </div>
                  )}

                  {picks && picks.length > 0 && (
                    <>
                      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none -mx-4 px-4">
                        {picks.map((pick, i) => (
                          <div key={i} className="snap-start shrink-0 w-[200px]">
                            <PickCard pick={pick} livePrice={pickPrices[pick.ticker]} onAnalyze={(t) => {
                              const mkt = pick.market === 'SET' ? 'SET' : pick.market === 'HKEX' ? 'HK' : 'US'
                              setSelectedMarket(mkt)
                              const base = t.replace(/\.(BK|HK)$/i, '')
                              setTicker(base)
                              analyze(t)
                            }} />
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 px-1">⚠️ AI-generated picks for educational purposes only. Not financial advice.</p>
                    </>
                  )}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[11px] font-semibold text-slate-400 tracking-widest uppercase">Popular Stocks</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* Quick tickers — grouped by market */}
                <div className="space-y-3">
                  {[
                    { label: '🇺🇸 US Markets', sublabel: 'NYSE · NASDAQ', tickers: QUICK_US, market: 'US', color: 'hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700' },
                    { label: '🇹🇭 Thailand',   sublabel: 'SET',           tickers: QUICK_TH, market: 'SET', color: 'hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700' },
                    { label: '🇭🇰 Hong Kong',  sublabel: 'HKEX',          tickers: QUICK_HK, market: 'HK',  color: 'hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700' },
                  ].map(group => (
                    <div key={group.label} className="bg-white rounded-2xl border border-slate-100 p-4">
                      <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-xs font-bold text-slate-700">{group.label}</span>
                        <span className="text-[10px] text-slate-400">{group.sublabel}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.tickers.map(t => (
                          <button key={t} onClick={() => {
                            setSelectedMarket(group.market)
                            setTicker(t)
                            analyze(buildFullTicker(t, group.market))
                          }}
                            className={`px-3 py-1.5 text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-600 transition-all ${group.color}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* pokproject CTA */}
                <a href="https://pokproject.com" target="_blank" rel="noopener noreferrer"
                  className="group flex items-center justify-between mt-4 px-4 py-3 bg-white border border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/50 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors text-base">🚀</div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">Explore more projects</p>
                      <p className="text-[10px] text-slate-400">pokproject.com</p>
                    </div>
                  </div>
                  <ChevronRight size={15} className="text-slate-300 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                </a>
              </div>
            )}

            {/* Loading */}
            {loading1 && (
              <div className="flex flex-col items-center py-24">
                <div className="relative mb-5">
                  <div className="w-14 h-14 rounded-full border-[3px] border-slate-100 border-t-blue-500 animate-spin" />
                  <BarChart3 size={18} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-500" />
                </div>
                <p className="text-slate-700 text-sm font-semibold mb-1">{loadingMsg}</p>
                <p className="text-slate-400 text-xs">This may take a few seconds...</p>
              </div>
            )}

            {/* Error */}
            {error && !loading1 && (
              <div className="flex flex-col items-center py-20 px-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
                  <AlertCircle size={24} className="text-rose-400" />
                </div>
                <p className="text-slate-800 text-sm font-bold mb-1">
                  {errorType === 'timeout' ? 'Search timed out' : 'Could not load data'}
                </p>
                <p className="text-slate-400 text-xs max-w-xs mb-1">
                  {errorType === 'timeout' ? 'This can happen with less common tickers. Try again.' : error}
                </p>
                <p className="text-blue-400 text-[11px] max-w-xs mb-4">Results are cached — retry often works.</p>
                <button onClick={() => analyze()}
                  className="px-5 py-2 text-sm font-bold text-white bg-blue-500 hover:bg-blue-400 rounded-xl transition-all hover:scale-105 active:scale-95">
                  Try Again
                </button>
              </div>
            )}

            {raw && (
              <Dashboard raw={raw} ai={ai} aiLoading={loading2}
                peers={peers} peersAvg={peersAvg} peersLoading={loadingPeers}
                periodDays={periodDays} onPeriodChange={onPeriodChange} />
            )}
          </>
        )}

        {/* ══ TAB: CONSULT ══ */}
        {tab === 'consult' && <PortfolioConsult />}
      </main>

      <footer className="border-t border-slate-100 mt-12 py-5">
        <p className="text-center text-[11px] text-slate-300 max-w-md mx-auto">
          For educational purposes only · Not financial advice · Consult a licensed advisor
        </p>
      </footer>
    </div>
  )
}
