import { useState, useCallback } from 'react'
import Dashboard from './Dashboard'
import { Search, Loader2, AlertCircle, BarChart3 } from 'lucide-react'

const QUICK = ['AAPL','VZ','JNJ','PEP','ABBV','ET','MSFT','KO']
const API = 'https://stock-dashboard-api.sakpongun.workers.dev'

export default function App() {
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

  const fetchAI = useCallback((sym, data, days) => {
    setAi(null); setLoading2(true); setError(null)
    fetch(API + '/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: sym, metrics: data, periodDays: days }),
    })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setAi(d) })
      .catch(e => setError('AI: ' + e.message))
      .finally(() => setLoading2(false))
  }, [])

  const analyze = useCallback(async (t, days) => {
    const sym = (t || ticker).trim().toUpperCase()
    if (!sym) return
    const pd = days || periodDays
    setTicker(sym); setPeriodDays(pd)
    setRaw(null); setAi(null); setPeers(null); setPeersAvg({}); setError(null)
    setLoading1(true); setLoading2(true); setLoadingPeers(true)

    try {
      const r1 = await fetch(API + '/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: sym }),
      })
      if (!r1.ok) throw new Error(await r1.text())
      const data = await r1.json()
      if (data.error) throw new Error(data.error)
      setRaw(data)
      setLoading1(false)

      // AI scoring
      fetchAI(sym, data, pd)

      // Industry peers (always fetch)
      fetch(API + '/api/peers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: sym, sector: data.sector, marketCap: data.marketCap }),
      })
        .then(r => r.json())
        .then(d => { setPeers(d.peers || []); setPeersAvg(d.avg || {}) })
        .catch(() => { setPeers([]); setPeersAvg({}) })
        .finally(() => setLoadingPeers(false))

    } catch (e) {
      setError(e.message)
      setLoading1(false); setLoading2(false); setLoadingPeers(false)
    }
  }, [ticker, periodDays, fetchAI])

  const onPeriodChange = useCallback((days) => {
    setPeriodDays(days)
    if (raw) fetchAI(raw.ticker, raw, days)
  }, [raw, fetchAI])

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <BarChart3 size={18} className="text-stone-700" />
            <span className="font-semibold text-stone-700 text-sm">Stock Analysis</span>
          </div>
          <div className="relative flex-1 max-w-sm">
            <input type="text" value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && analyze()}
              placeholder="Ticker e.g. AAPL"
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 font-mono placeholder:font-sans placeholder:text-stone-400"
              disabled={loading1} />
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
          </div>
          <button onClick={() => analyze()} disabled={loading1 || !ticker.trim()}
            className="px-3 py-1.5 text-sm font-medium bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-40 transition-colors">
            {loading1 ? <Loader2 size={14} className="animate-spin" /> : 'Analyze'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {!raw && !loading1 && !error && (
          <div className="flex flex-col items-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mb-5">
              <BarChart3 size={24} className="text-stone-400" />
            </div>
            <h1 className="text-xl font-semibold text-stone-800 mb-1">AI stock analysis dashboard</h1>
            <p className="text-stone-400 text-sm mb-6">Enter a US ticker for custom-period analysis with industry comparison</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK.map(t => (
                <button key={t} onClick={() => { setTicker(t); analyze(t) }}
                  className="px-3 py-1 text-xs font-mono bg-white border border-stone-200 rounded-md hover:bg-stone-50 text-stone-600">{t}</button>
              ))}
            </div>
          </div>
        )}
        {loading1 && (
          <div className="flex flex-col items-center py-20">
            <Loader2 size={28} className="animate-spin text-stone-400 mb-3" />
            <p className="text-stone-500 text-sm">Fetching {ticker} data...</p>
          </div>
        )}
        {error && !loading1 && (
          <div className="flex flex-col items-center py-20 px-4 text-center">
            <AlertCircle size={24} className="text-red-400 mb-2" />
            <p className="text-stone-700 text-sm font-medium mb-1">
              {error.includes('not found') ? 'Data unavailable' : 'Analysis error'}
            </p>
            <p className="text-stone-400 text-xs max-w-sm mb-1">
              {error.includes('not found')
                ? 'FMP free plan has a daily limit of 250 requests. The limit resets every 24 hours.'
                : error.includes('scoring')
                  ? 'AI scoring is temporarily unavailable. Please check your Anthropic API credit balance.'
                  : error}
            </p>
            {error.includes('not found') && (
              <p className="text-stone-300 text-[11px] max-w-sm mb-4">
                Try again tomorrow, or upgrade to FMP Starter ($19/mo) for higher limits + global stock coverage including SET Thailand.
              </p>
            )}
            <button onClick={() => analyze()} className="px-3 py-1.5 text-sm bg-stone-800 text-white rounded-lg">Retry</button>
          </div>
        )}
        {raw && (
          <Dashboard raw={raw} ai={ai} aiLoading={loading2}
            peers={peers} peersAvg={peersAvg} peersLoading={loadingPeers}
            periodDays={periodDays} onPeriodChange={onPeriodChange} />
        )}
      </main>

      <footer className="border-t border-stone-100 mt-12 py-4">
        <p className="text-center text-[11px] text-stone-300 max-w-md mx-auto">
          For educational purposes only. Not financial advice. Consult a licensed advisor.
        </p>
      </footer>
    </div>
  )
}
