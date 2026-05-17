import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Target, Shield, Clock, Upload, PlusCircle, Trash2, Loader2, Sparkles, AlertTriangle, CheckCircle, Award, PieChart, Star, ArrowRight, Users, Zap } from 'lucide-react'
import { API } from './config'

const RISK_LABELS = ['Very Safe','Conservative','Mod-Conservative','Moderate','Moderate','Mod-Aggressive','Mod-Aggressive','Aggressive','Very Aggressive','Max Risk']
const RISK_COLORS = ['#22c55e','#22c55e','#4ade80','#84cc16','#eab308','#f59e0b','#f97316','#ef4444','#dc2626','#991b1b']
const PERIODS = [
  { id: 'lt1',   label: '< 1 ปี',     emoji: '⏱️', years: 0.5  },
  { id: '1to3',  label: '1–3 ปี',     emoji: '📅', years: 2    },
  { id: '3to5',  label: '3–5 ปี',     emoji: '📊', years: 4    },
  { id: '5to10', label: '5–10 ปี',    emoji: '📈', years: 7.5  },
  { id: '10plus',label: '10+ ปี',     emoji: '🏔️', years: 15   },
]
const GRADE_COLORS = { A:'#22c55e', B:'#4ade80', C:'#eab308', D:'#f97316', F:'#ef4444' }
const THB_PRESETS = [500000, 1000000, 3000000, 5000000, 10000000]

// ─── Feasibility calculator (no current savings) ───
function calcFeasibility(targetAmt, periodYears, riskLevel) {
  const target = Number(targetAmt) || 0
  if (target <= 0 || !periodYears) return null
  const annualReturns = [0.03,0.04,0.05,0.06,0.07,0.08,0.09,0.10,0.12,0.15]
  const r   = annualReturns[riskLevel - 1] || 0.07
  const mo  = periodYears * 12
  const mr  = r / 12
  const pmt = mr > 0 && mo > 0
    ? target * mr / (Math.pow(1 + mr, mo) - 1)
    : mo > 0 ? target / mo : target
  const bench = target * 0.005
  const score = Math.max(5, Math.min(95, Math.round(100 - (pmt / bench) * 40)))
  let label, color, emoji
  if      (score >= 80) { label='Very Likely';  color='#22c55e'; emoji='🟢' }
  else if (score >= 60) { label='Achievable';   color='#84cc16'; emoji='🟡' }
  else if (score >= 40) { label='Challenging';  color='#f59e0b'; emoji='🟠' }
  else if (score >= 20) { label='Difficult';    color='#ef4444'; emoji='🔴' }
  else                  { label='Very Hard';    color='#991b1b'; emoji='⛔' }
  return { score, label, color, emoji, pmt, r }
}

function fmtTHB(num) {
  if (!num || num <= 0) return '฿0'
  if (num >= 1000000) return `฿${(num/1000000).toFixed(1)}M`
  if (num >= 1000)    return `฿${Math.round(num/1000)}K`
  return `฿${Math.round(num).toLocaleString()}`
}

// ─── Result section header ───
function ResultSection({ emoji, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-base leading-none">{emoji}</span>
        <span className="text-sm font-bold text-stone-700">{title}</span>
        <div className="flex-1 h-px bg-stone-200 ml-1" />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

// ─── Progress bar ───
function ProgressBar({ step, total }) {
  const pct = Math.round(((step + 1) / total) * 100)
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] text-stone-400">Step {step + 1} of {total}</span>
        <span className="text-[11px] font-mono text-indigo-500 font-medium">{pct}%</span>
      </div>
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width:`${pct}%`, background:'linear-gradient(90deg,#6366f1,#8b5cf6)' }} />
      </div>
    </div>
  )
}

export default function PortfolioConsult() {
  // ── state ──
  const [step, setStep]       = useState(0)
  const [goalType, setGoalType] = useState(null)   // 'standard' | 'target'
  const [stdGoal, setStdGoal]   = useState(null)
  const [targetAmt, setTargetAmt] = useState('')
  const [risk, setRisk]       = useState(5)
  const [periodYears, setPeriodYears]   = useState('')
  const [periodMonths, setPeriodMonths] = useState('')
  const [diaryChoice, setDiaryChoice]   = useState(null) // null | 'yes' | 'no'
  const [inputMode, setInputMode] = useState('manual')
  const [holdings, setHoldings]   = useState([{ ticker:'', shares:'', cost:'' }])
  const [image, setImage]         = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [counter, setCounter] = useState(null)
  const fileRef = useRef()

  useEffect(() => {
    fetch(API+'/api/counter').then(r=>r.json()).then(d=>setCounter(d.count)).catch(()=>{})
  }, [])

  const totalYears = (Number(periodYears)||0) + (Number(periodMonths)||0)/12
  const periodValid = totalYears > 0
  const periodLabel = [
    Number(periodYears)>0 ? `${periodYears} ปี` : '',
    Number(periodMonths)>0 ? `${periodMonths} เดือน` : '',
  ].filter(Boolean).join(' ') || '—'
  const selectedPeriod = periodValid ? { label: periodLabel, years: totalYears } : null
  const feasibility = goalType === 'target' && targetAmt
    ? calcFeasibility(targetAmt, totalYears || null, risk)
    : null

  // ── steps: 0=Goal 1=Risk 2=Period 3=Portfolio → result=99 ──
  const TOTAL = 4

  const addRow    = () => setHoldings([...holdings, { ticker:'', shares:'', cost:'' }])
  const removeRow = i  => setHoldings(holdings.filter((_,idx) => idx !== i))
  const updateRow = (i, f, v) => { const h=[...holdings]; h[i][f]=v; setHoldings(h) }
  const handleImage = e => {
    const f=e.target.files?.[0]; if(!f) return
    setImage(f); const r=new FileReader(); r.onload=ev=>setImagePreview(ev.target.result); r.readAsDataURL(f)
  }

  const canNext = () => {
    if (step===0) return goalType==='standard' ? stdGoal!=null : (goalType==='target' && Number(targetAmt)>0)
    if (step===1) return true
    if (step===2) return periodValid
    if (step===3) return inputMode==='upload' ? image!=null : holdings.some(h=>h.ticker.trim())
    return false
  }

  const submitAnalysis = async () => {
    setLoading(true); setResult(null)
    try {
      let portfolioText='', imageData=null, imageMime=null
      if (inputMode==='manual') {
        portfolioText = holdings.filter(h=>h.ticker.trim())
          .map(h=>`${h.ticker.toUpperCase()}: ${h.shares||'?'} shares, avg cost ฿${h.cost||'?'}`).join('\n')
      } else if (image) {
        imageMime = image.type || 'image/jpeg'
        imageData = await new Promise(resolve => {
          const r=new FileReader(); r.onload=e=>resolve(e.target.result.split(',')[1]); r.readAsDataURL(image)
        })
      }

      const goalLabel = goalType==='target'
        ? `Hit a Money Goal: ฿${Number(targetAmt).toLocaleString()}`
        : { longterm:'Long-term Savings', dividend:'Dividend Income', growth:'Growth', retire:'Retirement' }[stdGoal]

      const res = await fetch(API+'/api/consult', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          goal: goalLabel,
          risk, riskLabel: RISK_LABELS[risk-1],
          period: periodLabel,
          inputMode, portfolio: portfolioText, image: imageData, imageMime,
          currency: 'THB',
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult({ ...data, _feasibility: feasibility, _targetAmt: targetAmt })
      setStep(99)
      setCounter(c=>(c||0)+1)
    } catch(e) { setResult({ error: e.message }); setStep(99) }
    setLoading(false)
  }

  const reset = () => {
    setStep(0); setGoalType(null); setStdGoal(null); setTargetAmt('')
    setRisk(5); setPeriodYears(''); setPeriodMonths(''); setDiaryChoice(null)
    setHoldings([{ticker:'',shares:'',cost:''}])
    setImage(null); setImagePreview(null); setResult(null)
  }

  const AI_STEPS = [
    { icon: '🔍', text: 'Reading your portfolio...' },
    { icon: '📊', text: 'Analyzing risk & allocation...' },
    { icon: '⚡', text: 'Optimizing with AI...' },
    { icon: '🎯', text: 'Generating recommendations...' },
  ]
  const [aiStepIdx, setAiStepIdx] = useState(0)
  useEffect(() => {
    if (!loading) { setAiStepIdx(0); return }
    const iv = setInterval(() => setAiStepIdx(i => (i + 1) % AI_STEPS.length), 1800)
    return () => clearInterval(iv)
  }, [loading])

  if (loading) {
    return (
      <div className="max-w-lg mx-auto pb-10 flex flex-col items-center justify-center py-20">
        {/* Pulsing ring */}
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-full border-4 border-blue-100 border-t-blue-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-3xl">
            {AI_STEPS[aiStepIdx].icon}
          </div>
        </div>
        {/* Step text */}
        <p className="text-lg font-bold text-slate-800 mb-1 transition-all">{AI_STEPS[aiStepIdx].text}</p>
        <p className="text-sm text-slate-400 mb-8">AI กำลังตรวจสอบและ optimize พอร์ตของคุณ</p>
        {/* Progress dots */}
        <div className="flex gap-2">
          {AI_STEPS.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-all duration-500 ${i === aiStepIdx ? 'bg-blue-500 scale-125' : 'bg-slate-200'}`} />
          ))}
        </div>
        {/* Steps checklist */}
        <div className="mt-10 space-y-3 w-full max-w-xs">
          {AI_STEPS.map((s, i) => (
            <div key={i} className={`flex items-center gap-3 text-sm transition-all duration-300 ${i <= aiStepIdx ? 'text-slate-700' : 'text-slate-300'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 transition-all ${i < aiStepIdx ? 'bg-emerald-500 text-white' : i === aiStepIdx ? 'bg-blue-500 text-white animate-pulse' : 'bg-slate-100'}`}>
                {i < aiStepIdx ? '✓' : i + 1}
              </div>
              {s.text}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto pb-10">
      {counter!=null && counter>0 && step<99 && (
        <div className="flex items-center justify-center gap-1.5 mb-4 text-stone-400">
          <Users size={12}/><span className="text-[11px]">{counter.toLocaleString()} portfolios analyzed</span>
        </div>
      )}
      {step<99 && <ProgressBar step={step} total={TOTAL}/>}

      {/* ════ Step 0: Goal ════ */}
      {step===0 && (
        <div className="animate-slideIn">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{background:'linear-gradient(135deg,#e0e7ff,#c7d2fe)'}}>
              <Target size={18} className="text-indigo-600"/>
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-800">เป้าหมายการลงทุน</h2>
              <p className="text-[11px] text-stone-400">คุณลงทุนเพื่ออะไร?</p>
            </div>
          </div>

          {/* Standard goals */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {[
              { id:'longterm', emoji:'🏦', label:'Long-term Savings', desc:'สะสมความมั่งคั่ง 10+ ปี' },
              { id:'dividend', emoji:'💰', label:'Dividend Income',   desc:'รายได้ passive จากปันผล' },
              { id:'growth',   emoji:'🚀', label:'Growth',            desc:'เน้นเพิ่มมูลค่าเงินทุน'   },
              { id:'retire',   emoji:'🏖️', label:'Retirement',        desc:'อิสระภาพทางการเงิน'        },
            ].map(g=>(
              <button key={g.id}
                onClick={()=>{ setGoalType('standard'); setStdGoal(g.id); setTargetAmt('') }}
                className={`p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02] active:scale-[0.98]
                  ${goalType==='standard' && stdGoal===g.id
                    ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100'
                    : 'border-stone-200 bg-white hover:border-stone-300'}`}>
                <span className="text-2xl">{g.emoji}</span>
                <div className="text-sm font-semibold text-stone-800 mt-2">{g.label}</div>
                <div className="text-[11px] text-stone-400 mt-0.5">{g.desc}</div>
              </button>
            ))}
          </div>

          {/* Hit a Money Goal — special card */}
          <div className={`rounded-2xl border-2 overflow-hidden transition-all
            ${goalType==='target'
              ? 'border-purple-400 shadow-md shadow-purple-100'
              : 'border-stone-200 hover:border-purple-300'}`}>
            <button
              onClick={()=>{ setGoalType('target'); setStdGoal(null) }}
              className="w-full px-5 py-4 flex items-center gap-3 text-left"
              style={{background: goalType==='target' ? 'linear-gradient(135deg,#fdf4ff,#f5f3ff)' : 'white'}}>
              <span className="text-2xl">🎯</span>
              <div className="flex-1">
                <span className="text-sm font-semibold text-stone-800">Hit a Money Goal</span>
                <div className="text-[11px] text-stone-400 mt-0.5">ตั้งเป้าจำนวนเงินที่อยากถึง</div>
              </div>
              {goalType==='target' && <CheckCircle size={16} className="text-purple-500 shrink-0"/>}
            </button>

            {goalType==='target' && (
              <div className="px-5 pb-5 border-t border-purple-100" style={{background:'linear-gradient(135deg,#fdf4ff,#f5f3ff)'}}>
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-stone-600 mb-2">🎯 เป้าหมายเงิน (บาท)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-stone-300">฿</span>
                    <input
                      type="number" inputMode="numeric" min="0"
                      value={targetAmt}
                      onChange={e=>setTargetAmt(e.target.value)}
                      placeholder="1,000,000"
                      className="w-full pl-9 pr-4 py-3.5 text-xl font-bold text-stone-800 bg-white border-2 border-purple-200 rounded-xl focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {THB_PRESETS.map(p=>(
                      <button key={p} onClick={()=>setTargetAmt(String(p))}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all
                          ${Number(targetAmt)===p
                            ? 'border-purple-400 bg-purple-50 text-purple-700'
                            : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300'}`}>
                        {fmtTHB(p)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ════ Step 1: Risk ════ */}
      {step===1 && (
        <div className="animate-slideIn">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{background:'linear-gradient(135deg,#fef3c7,#fde68a)'}}>
              <Shield size={18} className="text-amber-600"/>
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-800">Risk Tolerance</h2>
              <p className="text-[11px] text-stone-400">รับความเสี่ยงได้มากแค่ไหน?</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <div className="text-center mb-6">
              <div className="text-5xl font-bold" style={{color:RISK_COLORS[risk-1]}}>{risk}</div>
              <div className="text-stone-400 text-sm">/10</div>
              <div className="text-sm font-semibold mt-2 px-3 py-1 rounded-full inline-block"
                style={{color:RISK_COLORS[risk-1],background:RISK_COLORS[risk-1]+'18'}}>
                {RISK_LABELS[risk-1]}
              </div>
            </div>
            <input type="range" min="1" max="10" value={risk}
              onChange={e=>setRisk(Number(e.target.value))}
              className="w-full h-2.5 rounded-full appearance-none cursor-pointer"
              style={{background:'linear-gradient(to right,#22c55e,#eab308,#ef4444)'}}/>
            <div className="flex justify-between text-[10px] text-stone-400 mt-2 px-1">
              <span>🛡️ Safe</span><span>⚖️ Balanced</span><span>🔥 Aggressive</span>
            </div>
          </div>

        </div>
      )}

      {/* ════ Step 2: Period ════ */}
      {step===2 && (
        <div className="animate-slideIn">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{background:'linear-gradient(135deg,#d1fae5,#a7f3d0)'}}>
              <Clock size={18} className="text-emerald-600"/>
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-800">Investment Period</h2>
              <p className="text-[11px] text-stone-400">จะถือนานแค่ไหน?</p>
            </div>
          </div>

          {/* Custom year + month input */}
          <div className="bg-white rounded-xl border-2 border-emerald-200 p-4 mb-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-stone-400 mb-1.5 tracking-wider">ปี</label>
                <div className="relative">
                  <input
                    type="number" inputMode="numeric" min="0" max="50"
                    value={periodYears}
                    onChange={e => setPeriodYears(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                    placeholder="0"
                    className="w-full px-4 py-3 text-2xl font-bold text-stone-800 text-center bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400">ปี</span>
                </div>
              </div>
              <div className="text-stone-300 text-xl font-light pb-3">+</div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold text-stone-400 mb-1.5 tracking-wider">เดือน</label>
                <div className="relative">
                  <input
                    type="number" inputMode="numeric" min="0" max="11"
                    value={periodMonths}
                    onChange={e => setPeriodMonths(e.target.value === '' ? '' : Math.min(11, Math.max(0, Number(e.target.value))))}
                    placeholder="0"
                    className="w-full px-4 py-3 text-2xl font-bold text-stone-800 text-center bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400">เดือน</span>
                </div>
              </div>
            </div>
            {periodValid && (
              <div className="mt-3 text-center text-sm font-semibold text-emerald-600">
                ✓ {periodLabel}
              </div>
            )}
          </div>

          {/* Quick-pick presets */}
          <div className="mb-3">
            <p className="text-[10px] text-stone-400 mb-2 font-semibold tracking-wider">QUICK SELECT</p>
            <div className="flex flex-wrap gap-2">
              {[
                {label:'6 เดือน', y:0, m:6}, {label:'1 ปี', y:1, m:0},
                {label:'2 ปี', y:2, m:0},   {label:'3 ปี', y:3, m:0},
                {label:'5 ปี', y:5, m:0},   {label:'10 ปี', y:10, m:0},
                {label:'15 ปี', y:15, m:0}, {label:'20 ปี', y:20, m:0},
              ].map(p => {
                const active = Number(periodYears)===p.y && Number(periodMonths)===p.m
                return (
                  <button key={p.label}
                    onClick={() => { setPeriodYears(p.y||''); setPeriodMonths(p.m||'') }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      active
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300'
                    }`}>
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      )}

      {/* ════ Step 3: Portfolio ════ */}
      {step===3 && (
        <div className="animate-slideIn">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{background:'linear-gradient(135deg,#ede9fe,#ddd6fe)'}}>
              <PieChart size={18} className="text-violet-600"/>
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-800">พอร์ตของคุณ</h2>
              <p className="text-[11px] text-stone-400">กรอก holdings หรืออัปโหลดภาพหน้าจอ</p>
            </div>
          </div>

          <div className="flex bg-stone-100 rounded-lg p-1 mb-4">
            <button onClick={()=>setInputMode('manual')}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${inputMode==='manual'?'bg-white text-stone-800 shadow-sm':'text-stone-500'}`}>
              ✏️ Manual
            </button>
            <button onClick={()=>setInputMode('upload')}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${inputMode==='upload'?'bg-white text-stone-800 shadow-sm':'text-stone-500'}`}>
              📸 Upload
            </button>
          </div>

          {inputMode==='manual' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_0.6fr_0.6fr_28px] gap-2 px-1">
                <span className="text-[10px] text-stone-400 font-semibold">TICKER</span>
                <span className="text-[10px] text-stone-400 font-semibold">SHARES</span>
                <span className="text-[10px] text-stone-400 font-semibold">AVG COST</span>
                <span></span>
              </div>
              {holdings.map((h,i)=>(
                <div key={i} className="grid grid-cols-[1fr_0.6fr_0.6fr_28px] gap-2">
                  <input value={h.ticker} onChange={e=>updateRow(i,'ticker',e.target.value.toUpperCase())}
                    placeholder="AAPL"
                    className="px-3 py-2.5 text-sm font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
                  <input value={h.shares} onChange={e=>updateRow(i,'shares',e.target.value)}
                    type="number" min="1" placeholder="10"
                    className="px-3 py-2.5 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
                  <input value={h.cost} onChange={e=>updateRow(i,'cost',e.target.value)}
                    type="number" min="0" step="0.01" placeholder="150"
                    className="px-3 py-2.5 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
                  {holdings.length>1
                    ? <button onClick={()=>removeRow(i)} className="flex items-center justify-center text-stone-300 hover:text-red-400"><Trash2 size={14}/></button>
                    : <div/>}
                </div>
              ))}
              <button onClick={addRow} className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 py-2 font-medium">
                <PlusCircle size={14}/> Add stock
              </button>
            </div>
          ) : (
            <div>
              <input type="file" ref={fileRef} accept="image/*" onChange={handleImage} className="hidden"/>
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Portfolio" className="w-full rounded-xl border border-stone-200"/>
                  <button onClick={()=>{setImage(null);setImagePreview(null)}}
                    className="absolute top-2 right-2 w-8 h-8 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80">✕</button>
                </div>
              ) : (
                <button onClick={()=>fileRef.current?.click()}
                  className="w-full py-14 border-2 border-dashed border-stone-300 rounded-xl text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-all">
                  <Upload size={32} className="mx-auto text-stone-400 mb-3"/>
                  <div className="text-sm text-stone-500 font-medium">Drop or click to browse</div>
                  <div className="text-[10px] text-stone-400 mt-1">PNG, JPG, WEBP</div>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════ Results ════ */}
      {step===99 && result && (
        <div className="animate-slideIn">
          {result.error ? (
            <div className="text-center py-10">
              <AlertTriangle size={32} className="text-red-400 mx-auto mb-3"/>
              <p className="text-sm text-stone-600 font-medium mb-1">Analysis failed</p>
              <p className="text-xs text-stone-400 mb-4">{result.error}</p>
              <button onClick={()=>setStep(3)} className="text-xs text-indigo-500 hover:underline">← Go back</button>
            </div>
          ) : (
            <div className="space-y-6">

              {/* ── Section 1: Input Summary ── */}
              {(() => {
                // calc proportions for manual holdings
                const validH = holdings.filter(h => h.ticker.trim())
                const vals = validH.map(h => (parseFloat(h.shares)||0) * (parseFloat(h.cost)||0))
                const totalVal = vals.reduce((a,b) => a+b, 0)
                // sector color palette
                const sectorColors = ['#6366f1','#14b8a6','#f59e0b','#ef4444','#8b5cf6','#22c55e','#f97316','#06b6d4']
                return (
                  <ResultSection emoji="📋" title="สรุปข้อมูลที่ใส่">
                    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">

                      {/* Goal + Risk + Period */}
                      <div className="grid grid-cols-3 divide-x divide-stone-100 border-b border-stone-100">
                        <div className="p-3">
                          <div className="text-[9px] font-semibold text-stone-400 tracking-wider mb-1">GOAL</div>
                          <div className="text-xs font-semibold text-stone-700 leading-snug">
                            {goalType==='target'
                              ? <>🎯 ฿{Number(targetAmt).toLocaleString()}</>
                              : { longterm:'🏦 Long-term', dividend:'💰 Dividend', growth:'🚀 Growth', retire:'🏖️ Retire' }[stdGoal] || '—'}
                          </div>
                        </div>
                        <div className="p-3">
                          <div className="text-[9px] font-semibold text-stone-400 tracking-wider mb-1">RISK</div>
                          <div className="text-xs font-semibold" style={{color:RISK_COLORS[risk-1]}}>
                            {risk}/10 · {RISK_LABELS[risk-1]}
                          </div>
                        </div>
                        <div className="p-3">
                          <div className="text-[9px] font-semibold text-stone-400 tracking-wider mb-1">PERIOD</div>
                          <div className="text-xs font-semibold text-stone-700">{selectedPeriod?.label || '—'}</div>
                        </div>
                      </div>

                      {/* Portfolio holdings table (manual) */}
                      {inputMode==='manual' && validH.length>0 && (
                        <div className="p-3 border-b border-stone-100">
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="text-[9px] font-semibold text-stone-400 tracking-wider">PORTFOLIO</div>
                            <button onClick={()=>setStep(3)}
                              className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium px-2 py-0.5 rounded-md hover:bg-indigo-50 transition-colors">
                              ✏️ แก้ไข
                            </button>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-stone-100">
                                  <th className="text-left py-1 text-[10px] font-semibold text-stone-400">TICKER</th>
                                  <th className="text-right py-1 text-[10px] font-semibold text-stone-400">SHARES</th>
                                  <th className="text-right py-1 text-[10px] font-semibold text-stone-400">AVG COST</th>
                                  <th className="text-right py-1 text-[10px] font-semibold text-stone-400">VALUE</th>
                                  <th className="text-right py-1 text-[10px] font-semibold text-stone-400">%</th>
                                </tr>
                              </thead>
                              <tbody>
                                {validH.map((h,i) => {
                                  const v = vals[i]
                                  const pct = totalVal>0 ? Math.round((v/totalVal)*100) : Math.round(100/validH.length)
                                  return (
                                    <tr key={i} className="border-b border-stone-50 last:border-0">
                                      <td className="py-1.5 font-mono font-bold text-indigo-600">{h.ticker}</td>
                                      <td className="py-1.5 text-right text-stone-500">{h.shares||'—'}</td>
                                      <td className="py-1.5 text-right text-stone-400">{h.cost ? `฿${h.cost}` : '—'}</td>
                                      <td className="py-1.5 text-right font-mono text-stone-600">{v>0 ? `฿${Math.round(v).toLocaleString()}` : '—'}</td>
                                      <td className="py-1.5 text-right">
                                        <span className="font-mono font-semibold text-indigo-500">{pct}%</span>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                          {/* proportion bar */}
                          {totalVal>0 && (
                            <div className="flex h-2.5 rounded-full overflow-hidden mt-3 gap-px">
                              {validH.map((h,i) => {
                                const pct = Math.round((vals[i]/totalVal)*100)
                                return pct>0 ? (
                                  <div key={i} title={`${h.ticker} ${pct}%`}
                                    className="h-full transition-all duration-700"
                                    style={{width:`${pct}%`, background:sectorColors[i%sectorColors.length]}}/>
                                ) : null
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Upload mode — show parsed note (no image) */}
                      {inputMode==='upload' && (
                        <div className="p-3 border-b border-stone-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">📸</span>
                            <span className="text-xs text-stone-500">วิเคราะห์จากภาพถ่ายพอร์ต</span>
                          </div>
                          <button onClick={()=>setStep(3)}
                            className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium px-2 py-0.5 rounded-md hover:bg-indigo-50 transition-colors">
                            ✏️ แก้ไข
                          </button>
                        </div>
                      )}

                      {/* Sector / Category breakdown */}
                      {result.sectorBreakdown?.length>0 && (
                        <div className="p-3">
                          <div className="text-[9px] font-semibold text-stone-400 tracking-wider mb-2.5">CATEGORY</div>
                          <div className="space-y-3">
                            {result.sectorBreakdown.map((s,i) => {
                              // parse "Sector Name (TICKER1, TICKER2)" → split sector label and tickers
                              const match = s.sector.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
                              const sectorLabel = match ? match[1].trim() : s.sector
                              const tickerStr = match ? match[2] : null
                              const tickers = s.tickers
                                ? s.tickers
                                : tickerStr ? tickerStr.split(/[,/]/).map(t => t.trim()).filter(Boolean) : []
                              const color = sectorColors[i%sectorColors.length]
                              return (
                                <div key={i} className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-sm shrink-0 mt-0.5" style={{background:color}}/>
                                  <div className="flex-1 min-w-0">
                                    {tickers.length>0 ? (
                                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                        <span className="text-xs font-bold text-stone-800">{tickers.join(' · ')}</span>
                                        <span className="text-[10px] text-stone-400">{sectorLabel}</span>
                                      </div>
                                    ) : (
                                      <span className="text-xs font-medium text-stone-700">{sectorLabel}</span>
                                    )}
                                  </div>
                                  <div className="w-20 bg-stone-100 rounded-full h-1.5 overflow-hidden shrink-0">
                                    <div className="h-full rounded-full" style={{width:`${s.pct}%`, background:color}}/>
                                  </div>
                                  <span className="text-[11px] font-mono font-semibold text-stone-500 w-8 text-right shrink-0">{s.pct}%</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* No holdings fallback */}
                      {inputMode==='manual' && validH.length===0 && (
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-xs text-stone-400">ไม่มี holdings</span>
                          <button onClick={()=>setStep(3)}
                            className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium px-2 py-0.5 rounded-md hover:bg-indigo-50 transition-colors">
                            ✏️ แก้ไข
                          </button>
                        </div>
                      )}
                    </div>
                  </ResultSection>
                )
              })()}

              {/* ── Section 2: Portfolio Assessment ── */}
              <ResultSection emoji="🏆" title="ผลการวิเคราะห์">
                <div className="relative overflow-hidden rounded-2xl p-5"
                  style={{background:'linear-gradient(135deg,#1e1b4b,#312e81)'}}>
                  <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10"
                    style={{background:'radial-gradient(circle,#a5b4fc,transparent)'}}/>
                  {result.portfolioGrade && (
                    <div className="flex items-center gap-2 mb-3">
                      <Award size={18} className="text-indigo-300"/>
                      <span className="text-indigo-300 text-xs font-medium">Portfolio Grade</span>
                      <span className="ml-auto text-3xl font-bold"
                        style={{color:GRADE_COLORS[result.portfolioGrade]||'#e4e4e7'}}>
                        {result.portfolioGrade}
                      </span>
                    </div>
                  )}
                  <p className="text-indigo-100 text-sm leading-relaxed">{result.summary}</p>
                </div>
              </ResultSection>

              {/* ── Section 3: Goal Feasibility (only if target) ── */}
              {result._feasibility && result._targetAmt && (
                <ResultSection emoji="🎯" title="เป้าหมายและความเป็นไปได้">
                  <div className="rounded-2xl overflow-hidden border border-purple-200 bg-white">
                    <div className="px-4 py-3 flex items-center gap-2 border-b border-purple-100"
                      style={{background:'linear-gradient(135deg,#fdf4ff,#f5f3ff)'}}>
                      <Zap size={14} className="text-purple-500"/>
                      <span className="text-sm font-bold text-purple-800">Goal Feasibility</span>
                      <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{color:result._feasibility.color, background:result._feasibility.color+'22'}}>
                        {result._feasibility.emoji} {result._feasibility.label}
                      </span>
                    </div>
                    <div className="px-4 py-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-stone-500">เป้าหมาย</span>
                        <span className="text-sm font-bold text-stone-800">฿{Number(result._targetAmt).toLocaleString()}</span>
                      </div>
                      <div className="h-3 bg-stone-100 rounded-full overflow-hidden mb-2">
                        <div className="h-full rounded-full transition-all duration-1000"
                          style={{width:`${result._feasibility.score}%`, background:result._feasibility.color}}/>
                      </div>
                      <div className="flex justify-between text-[10px] text-stone-400 mb-3">
                        <span>Score <strong className="text-stone-600">{result._feasibility.score}/100</strong></span>
                        <span>ผลตอบแทนคาด <strong className="text-indigo-600">{Math.round(result._feasibility.r*100)}%/ปี</strong></span>
                      </div>
                      {result._feasibility.pmt > 0 && (
                        <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2.5 flex items-center justify-between">
                          <span className="text-xs text-indigo-500">ออมเพิ่มต่อเดือนเพื่อถึงเป้า</span>
                          <span className="text-base font-extrabold text-indigo-700">
                            {fmtTHB(Math.round(result._feasibility.pmt))}
                            <span className="text-xs font-normal text-indigo-400">/เดือน</span>
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="px-4 py-2 bg-stone-50 border-t border-stone-100">
                      <p className="text-[10px] text-stone-400">คำนวณจากผลตอบแทนเฉลี่ยทางประวัติศาสตร์ ไม่รับประกันผลจริง</p>
                    </div>
                  </div>
                </ResultSection>
              )}

              {/* ── Section 4: Portfolio Breakdown ── */}
              {result.targetAllocation?.length>0 && (
                <ResultSection emoji="📊" title="โครงสร้างพอร์ตโฟลิโอที่แนะนำ">
                  <div className="bg-white rounded-xl border border-stone-200 p-4">
                      <div className="text-[10px] font-semibold text-stone-400 mb-3 tracking-wider">SUGGESTED ALLOCATION</div>
                      <div className="space-y-2.5">
                        {result.targetAllocation.map((a,i)=>(
                          <div key={i}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-mono font-semibold text-stone-700">{a.asset}</span>
                              <span className="text-xs font-mono font-semibold text-stone-500">{a.pct}%</span>
                            </div>
                            <div className="bg-stone-100 rounded-full h-3 overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{width:`${a.pct}%`,background:`hsl(${220+i*28},65%,55%)`}}/>
                            </div>
                            {a.reason && <div className="text-[10px] text-stone-400 mt-0.5">{a.reason}</div>}
                          </div>
                        ))}
                      </div>
                  </div>
                </ResultSection>
              )}

              {/* ── Section 5: Risk Analysis ── */}
              {result.riskAssessment && (
                <ResultSection emoji="⚖️" title="การวิเคราะห์ความเสี่ยง">
                  <div className="bg-white rounded-xl border border-stone-200 p-4">
                    <div className="flex items-center gap-5">
                      <div className="text-center">
                        <div className="text-[10px] text-stone-400 mb-1">Current</div>
                        <div className="text-2xl font-bold" style={{color:RISK_COLORS[Math.min((result.riskAssessment.current||5)-1,9)]}}>
                          {result.riskAssessment.current}
                        </div>
                      </div>
                      <ArrowRight size={20} className="text-stone-300 shrink-0"/>
                      <div className="text-center">
                        <div className="text-[10px] text-stone-400 mb-1">Target</div>
                        <div className="text-2xl font-bold" style={{color:RISK_COLORS[Math.min((result.riskAssessment.target||5)-1,9)]}}>
                          {result.riskAssessment.target}
                        </div>
                      </div>
                      <div className="flex-1 text-xs text-stone-500 leading-relaxed border-l border-stone-100 pl-4">
                        {result.riskAssessment.note}
                      </div>
                    </div>
                  </div>
                </ResultSection>
              )}

              {/* ── Section 6: Recommendations ── */}
              {(result.issues?.length>0 || result.recommendations?.length>0 || result.suggestedStocks?.length>0) && (
                <ResultSection emoji="💡" title="คำแนะนำ">
                  {result.issues?.length>0 && (
                    <div className="rounded-xl border border-red-200 overflow-hidden">
                      <div className="bg-red-50 px-4 py-2.5 flex items-center gap-1.5">
                        <AlertTriangle size={13} className="text-red-500"/>
                        <span className="text-xs font-semibold text-red-700">Issues Found</span>
                      </div>
                      <div className="bg-white p-4 space-y-2">
                        {result.issues.map((issue,i)=>(
                          <div key={i} className="flex items-start gap-2 text-xs text-red-600">
                            <span className="w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-[10px] font-bold shrink-0">{i+1}</span>
                            {issue}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.recommendations?.length>0 && (
                    <div className="rounded-xl border border-emerald-200 overflow-hidden">
                      <div className="bg-emerald-50 px-4 py-2.5 flex items-center gap-1.5">
                        <CheckCircle size={13} className="text-emerald-500"/>
                        <span className="text-xs font-semibold text-emerald-700">Recommendations</span>
                      </div>
                      <div className="bg-white p-4 space-y-2.5">
                        {result.recommendations.map((rec,i)=>(
                          <div key={i} className="flex items-start gap-2.5 text-xs text-emerald-700">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold shrink-0">{i+1}</span>
                            <span className="leading-relaxed">{rec}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.suggestedStocks?.length>0 && (
                    <div className="rounded-xl border border-indigo-200 overflow-hidden">
                      <div className="bg-indigo-50 px-4 py-2.5 flex items-center gap-1.5">
                        <Star size={13} className="text-indigo-500"/>
                        <span className="text-xs font-semibold text-indigo-700">Stocks to Consider</span>
                      </div>
                      <div className="bg-white divide-y divide-stone-100">
                        {result.suggestedStocks.map((s,i)=>(
                          <div key={i} className="px-4 py-3 flex items-center gap-3">
                            <span className="font-mono font-bold text-sm text-indigo-600 w-12">{s.ticker}</span>
                            <div className="flex-1">
                              <div className="text-xs font-medium text-stone-700">{s.name}</div>
                              <div className="text-[11px] text-stone-400">{s.reason}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </ResultSection>
              )}

              {/* ── Trading Diary ── */}
              {diaryChoice === null && (
                <div className="rounded-2xl border-2 border-indigo-200 overflow-hidden"
                  style={{background:'linear-gradient(135deg,#eef2ff,#f5f3ff)'}}>
                  <div className="px-4 py-3 flex items-center gap-2 border-b border-indigo-100">
                    <span className="text-base">📒</span>
                    <span className="text-sm font-bold text-indigo-800">บันทึก Trading Diary?</span>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-indigo-600 mb-3 leading-relaxed">
                      บันทึกผลวิเคราะห์วันนี้ไว้ใน Diary เพื่อติดตามพอร์ตและเปรียบเทียบในอนาคต
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const entry = {
                            date: new Date().toISOString().slice(0,10),
                            goal: goalType==='target' ? `฿${Number(targetAmt).toLocaleString()}` : stdGoal,
                            risk, period: periodLabel,
                            grade: result.portfolioGrade,
                            summary: result.summary,
                            holdings: holdings.filter(h=>h.ticker.trim()),
                          }
                          const existing = JSON.parse(localStorage.getItem('tradingDiary')||'[]')
                          localStorage.setItem('tradingDiary', JSON.stringify([entry, ...existing]))
                          setDiaryChoice('yes')
                        }}
                        className="flex-1 py-2 text-sm font-semibold rounded-xl border-2 border-indigo-400 text-indigo-700 bg-white hover:bg-indigo-50 transition-all">
                        ✅ บันทึกไว้
                      </button>
                      <button onClick={() => setDiaryChoice('no')}
                        className="flex-1 py-2 text-sm font-semibold rounded-xl border-2 border-stone-200 text-stone-500 bg-white hover:bg-stone-50 transition-all">
                        ❌ ไม่เป็นไร
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {diaryChoice === 'yes' && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
                  <span className="text-xl">📒</span>
                  <div>
                    <div className="text-xs font-bold text-emerald-700">บันทึกแล้ว!</div>
                    <div className="text-[11px] text-emerald-500">วันที่ {new Date().toLocaleDateString('th-TH')} · Grade {result.portfolioGrade}</div>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-stone-300 text-center">AI analysis for educational purposes only. Not financial advice.</p>
              <button onClick={reset} className="w-full py-2.5 text-sm font-semibold text-white rounded-xl transition-all hover:scale-[1.02]"
                style={{background:'linear-gradient(135deg,#4338ca,#6366f1)'}}>
                Analyze Another Portfolio
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Nav ── */}
      {step<99 && (
        <div className="flex justify-between mt-6">
          <button onClick={()=>setStep(s=>Math.max(0,s-1))} disabled={step===0}
            className="flex items-center gap-1 px-4 py-2 text-sm text-stone-500 disabled:opacity-30 hover:text-stone-700 rounded-lg hover:bg-stone-100">
            <ChevronLeft size={16}/> Back
          </button>
          {step<3 ? (
            <button onClick={()=>setStep(s=>s+1)} disabled={!canNext()}
              className="flex items-center gap-1 px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 transition-all hover:scale-105"
              style={{background:'linear-gradient(135deg,#4338ca,#6366f1)'}}>
              Next <ChevronRight size={16}/>
            </button>
          ) : (
            <button onClick={submitAnalysis} disabled={!canNext()||loading}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 transition-all hover:scale-105"
              style={{background:'linear-gradient(135deg,#4338ca,#6366f1)'}}>
              {loading ? <><Loader2 size={14} className="animate-spin"/> Analyzing...</> : <><Sparkles size={14}/> Analyze</>}
            </button>
          )}
        </div>
      )}

      <style>{`
        .animate-slideIn { animation: slideIn 0.35s ease-out; }
        @keyframes slideIn { from { opacity:0; transform:translateX(24px); } to { opacity:1; transform:translateX(0); } }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; width:24px; height:24px; border-radius:50%; background:white; border:3px solid #6366f1; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.15); }
        input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance:none; margin:0; }
      `}</style>
    </div>
  )
}
