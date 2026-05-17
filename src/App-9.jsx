import { useState, useCallback, useEffect } from 'react'
import Dashboard from './Dashboard'
import PortfolioConsult from './PortfolioConsult'
import { Search, Loader2, AlertCircle, BarChart3, Globe, TrendingUp, Shield, Flame, Sparkles, Briefcase } from 'lucide-react'

const QUICK = ['AAPL','VZ','JNJ','PEP','ABBV','ET','MSFT','KO']
const API = 'https://stock-dashboard-api.sakpongun.workers.dev'

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
  aggressive: { label: 'Aggressive', icon: Flame, gradient: 'from-red-500 to-orange-500', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-600', dot: 'bg-red-400' },
  balanced: { label: 'Balanced', icon: TrendingUp, gradient: 'from-amber-500 to-yellow-500', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-600', dot: 'bg-amber-400' },
  conservative: { label: 'Conservative', icon: Shield, gradient: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-600', dot: 'bg-emerald-400' },
}

function PickCard({ pick, onAnalyze }) {
  const rc = RISK_CONFIG[pick.risk] || RISK_CONFIG.balanced
  const Icon = rc.icon
  const pct = pick.changePercent
  return (
    <button onClick={() => onAnalyze(pick.ticker)}
      className={`group relative flex flex-col w-full rounded-xl border ${rc.border} ${rc.bg} p-4 text-left transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]`}>
      <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-xl bg-gradient-to-r ${rc.gradient}`} />
      <div className="flex items-center justify-between mb-3 mt-1">
        <div className="flex items-center gap-2">
          <span className="text-xl">{pick.emoji || '📈'}</span>
          <div>
            <span className="font-bold text-stone-800 text-sm">{pick.ticker}</span>
            <span className={`ml-2 text-xs font-medium ${pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {pct >= 0 ? '+' : ''}{pct?.toFixed(1)}%
            </span>
          </div>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${rc.badge} flex items-center gap-1`}>
          <Icon size={10} />{rc.label}
        </span>
      </div>
      <p className="text-xs text-stone-500 truncate mb-1">{pick.name}</p>
      <p className="text-lg font-semibold text-stone-800 mb-2">${pick.price?.toLocaleString()}</p>
      <p className={`text-xs ${rc.text} font-medium mb-3 leading-relaxed`}>{pick.reason}</p>
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-stone-100">
        <span className="text-[10px] text-stone-400">{pick.sector}</span>
        <span className="text-[10px] text-indigo-500 font-medium group-hover:text-indigo-700 transition-colors">Analyze →</span>
      </div>
    </button>
  )
}

export default function App() {
  const [tab, setTab] = useState('analyze') // 'analyze' | 'consult'
  const [ticker, setTicker] = useState('')
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

  useEffect(() => {
    setPicksLoading(true)
    fetch(API + '/api/picks')
      .then(r => r.json())
      .then(d => { if (d.picks && d.picks.length) { setPicks(d.picks); setPicksDate(d.date) } })
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
    const sym = (t || ticker).trim().toUpperCase()
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
  }, [ticker, periodDays, fetchAI, errorType])

  const onPeriodChange = useCallback((days) => {
    setPeriodDays(days)
    if (raw) fetchAI(raw.ticker, raw, days)
  }, [raw, fetchAI])

  const showLanding = tab === 'analyze' && !raw && !loading1 && !error

  return (
    <div className="min-h-screen bg-stone-50">
      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-50 border-b border-indigo-100" style={{background:'linear-gradient(135deg,#1e1b4b 0%,#312e81 40%,#4338ca 100%)'}}>
        <div className="max-w-5xl mx-auto px-4 py-2.5">
          {/* Mobile logo */}
          <div className="flex items-center justify-between mb-2 sm:mb-0 sm:hidden">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background:'rgba(255,255,255,0.15)'}}>
                <BarChart3 size={14} className="text-white" />
              </div>
              <div>
                <span className="font-semibold text-white text-xs block leading-tight">Stock Analysis</span>
                <span className="text-indigo-300 text-[9px] flex items-center gap-1"><Globe size={8} />US stocks only</span>
              </div>
            </div>
          </div>
          {/* Search bar row */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:'rgba(255,255,255,0.15)'}}>
                <BarChart3 size={16} className="text-white" />
              </div>
              <div>
                <span className="font-semibold text-white text-sm block leading-tight">Stock Analysis</span>
                <span className="text-indigo-300 text-[9px] flex items-center gap-1"><Globe size={8} />US stocks only</span>
              </div>
            </div>
            {tab === 'analyze' && (
              <>
                <div className="relative flex-1">
                  <input type="text" value={ticker}
                    onChange={e => setTicker(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && analyze()}
                    placeholder="Ticker e.g. AAPL"
                    className="w-full pl-8 pr-3 py-1.5 text-sm border-0 rounded-lg font-mono placeholder:font-sans placeholder:text-indigo-300 text-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    style={{background:'rgba(255,255,255,0.12)'}}
                    disabled={loading1} />
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-300" />
                </div>
                <button onClick={() => analyze()} disabled={loading1 || !ticker.trim()}
                  className="px-4 py-1.5 text-sm font-medium text-indigo-900 rounded-lg disabled:opacity-40 transition-all hover:scale-105 active:scale-95 shrink-0"
                  style={{background:'linear-gradient(135deg,#c7d2fe,#e0e7ff)'}}>
                  {loading1 ? <Loader2 size={14} className="animate-spin" /> : 'Analyze'}
                </button>
              </>
            )}
            {tab === 'consult' && (
              <div className="flex-1 text-center">
                <span className="text-indigo-200 text-sm">Portfolio Consultant</span>
              </div>
            )}
          </div>
          {/* Tab menu */}
          <div className="flex gap-1 mt-2 -mb-0.5">
            <button onClick={() => { setTab('analyze'); setRaw(null); setError(null) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition-all ${tab === 'analyze' ? 'bg-stone-50 text-indigo-700' : 'text-indigo-300 hover:text-white'}`}>
              <BarChart3 size={12} /> Analyze
            </button>
            <button onClick={() => { setTab('consult'); setRaw(null); setError(null) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition-all ${tab === 'consult' ? 'bg-stone-50 text-indigo-700' : 'text-indigo-300 hover:text-white'}`}>
              <Briefcase size={12} /> ปรับพอร์ต
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* ══ TAB: ANALYZE ══ */}
        {tab === 'analyze' && (
          <>
            {/* Landing */}
            {showLanding && (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{background:'linear-gradient(135deg,#e0e7ff,#c7d2fe)'}}>
                  <BarChart3 size={28} className="text-indigo-600" />
                </div>
                <h1 className="text-xl font-semibold text-stone-800 mb-1">AI-powered stock analysis</h1>
                <p className="text-stone-400 text-sm mb-1">Custom-period scoring with industry comparison</p>
                <p className="text-indigo-400 text-xs mb-6 flex items-center gap-1">
                  <Globe size={11} />US-listed stocks (NYSE, NASDAQ, AMEX)
                </p>

                {picksLoading && (
                  <div className="flex items-center gap-2 mb-6">
                    <Loader2 size={14} className="animate-spin text-indigo-400" />
                    <span className="text-xs text-indigo-400">Loading AI picks...</span>
                  </div>
                )}

                {picks && picks.length > 0 && (
                  <div className="w-full max-w-2xl mb-8">
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <Sparkles size={16} className="text-indigo-500" />
                      <span className="text-sm font-semibold text-stone-700">AI Picks Today</span>
                      {picksDate && <span className="text-[10px] text-stone-400 ml-1">· {picksDate}</span>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {picks.map((pick, i) => (
                        <PickCard key={i} pick={pick} onAnalyze={(t) => { setTicker(t); analyze(t) }} />
                      ))}
                    </div>
                    <p className="text-[10px] text-stone-300 mt-3">AI-generated suggestions for educational purposes only.</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 justify-center">
                  {QUICK.map(t => (
                    <button key={t} onClick={() => { setTicker(t); analyze(t) }}
                      className="px-3 py-1 text-xs font-mono bg-white border border-stone-200 rounded-md hover:bg-indigo-50 hover:border-indigo-200 text-stone-600 hover:text-indigo-600 transition-colors">{t}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading */}
            {loading1 && (
              <div className="flex flex-col items-center py-20">
                <div className="relative mb-4">
                  <div className="w-12 h-12 rounded-full border-indigo-100 border-t-indigo-500 animate-spin" style={{borderWidth:'3px',borderStyle:'solid'}} />
                  <BarChart3 size={16} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-500" />
                </div>
                <p className="text-stone-600 text-sm font-medium">{loadingMsg}</p>
                <div className="flex gap-1 mt-4">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay:'0ms'}} />
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay:'150ms'}} />
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay:'300ms'}} />
                </div>
              </div>
            )}

            {/* Error */}
            {error && !loading1 && (
              <div className="flex flex-col items-center py-20 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3">
                  <AlertCircle size={22} className="text-red-400" />
                </div>
                <p className="text-stone-700 text-sm font-medium mb-1">
                  {errorType === 'timeout' ? 'AI search timed out' : 'Analysis error'}
                </p>
                <p className="text-stone-400 text-xs max-w-sm mb-2">
                  {errorType === 'timeout' ? 'AI search was slow. This can happen with less common tickers.' : error}
                </p>
                <p className="text-indigo-400 text-[11px] max-w-sm mb-3">Tip: Retry often works — search results get cached.</p>
                <button onClick={() => analyze()}
                  className="px-4 py-1.5 text-sm font-medium text-white rounded-lg transition-all hover:scale-105"
                  style={{background:'linear-gradient(135deg,#4338ca,#6366f1)'}}>Retry</button>
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

      <footer className="border-t border-stone-100 mt-12 py-4">
        <p className="text-center text-[11px] text-stone-300 max-w-md mx-auto">
          For educational purposes only. Not financial advice. Consult a licensed advisor.
        </p>
      </footer>
    </div>
  )
}
