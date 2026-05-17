import { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, RefreshCw, Globe } from 'lucide-react'

const API = 'https://stock-dashboard-api.sakpongun.workers.dev'

const MARKET_FLAG = { SET: '🇹🇭', HKEX: '🇭🇰', US: '🇺🇸' }

function timeAgo(ms) {
  if (!ms) return '—'
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

export default function StatsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetch(API + '/api/views')
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const stocks = data?.stocks || []
  const max = stocks[0]?.count || 1

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0f172a] border-b border-white/5 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center">
              <BarChart3 size={16} className="text-white" />
            </div>
            <div>
              <p className="text-white text-sm font-bold">StockAI · Stats</p>
              <p className="text-slate-500 text-[10px] flex items-center gap-1"><Globe size={8} />View Tracker</p>
            </div>
          </div>
          <button onClick={load} className="text-slate-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-xs text-slate-400 mb-1">Total Views</p>
            <p className="text-2xl font-bold text-slate-800">{loading ? '—' : (data?.total || 0).toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-xs text-slate-400 mb-1">Unique Stocks</p>
            <p className="text-2xl font-bold text-slate-800">{loading ? '—' : stocks.length}</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 flex items-center gap-2">
            <TrendingUp size={14} className="text-blue-500" />
            <span className="text-sm font-bold text-slate-700">Most Viewed Stocks</span>
          </div>

          {loading && (
            <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
          )}

          {!loading && stocks.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">No data yet — views will appear as users analyze stocks.</div>
          )}

          {!loading && stocks.length > 0 && (
            <div className="divide-y divide-slate-50">
              {stocks.map((s, i) => (
                <div key={s.ticker} className="flex items-center gap-3 px-4 py-3">
                  {/* Rank */}
                  <span className="text-xs font-bold text-slate-300 w-5 text-center shrink-0">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </span>
                  {/* Market flag */}
                  <span className="text-base shrink-0">{MARKET_FLAG[s.market] || '🌐'}</span>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800 font-mono">{s.ticker}</span>
                      <span className="text-[10px] text-slate-400 truncate">{s.name}</span>
                    </div>
                    {/* Bar */}
                    <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden w-full">
                      <div className="h-full bg-blue-400 rounded-full transition-all"
                        style={{ width: `${Math.round((s.count / max) * 100)}%` }} />
                    </div>
                  </div>
                  {/* Count + time */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-700">{s.count.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400">{timeAgo(s.last)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-[10px] text-slate-300 mt-6">
          Data stored in Cloudflare KV · Updates on each stock view
        </p>
      </main>
    </div>
  )
}
