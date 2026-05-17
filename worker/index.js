// worker/index.js — v20: better scrape + AI picks
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const TTL_QUOTE = 900;
const TTL_FUNDAMENTAL = 86400;
const TTL_SCORE = 14400; // 4hr (was 1hr — reduce repeat scoring calls)
const TTL_PEERS = 86400;
const TTL_PICKS = 86400;
const TTL_WATCH = 86400;

const WEIGHTS = {
  7: { wT: 80, wF: 20 }, 14: { wT: 75, wF: 25 },
  30: { wT: 65, wF: 35 }, 90: { wT: 50, wF: 50 },
  180: { wT: 35, wF: 65 }, 365: { wT: 25, wF: 75 },
  730: { wT: 15, wF: 85 }, 1825: { wT: 10, wF: 90 },
};

const MODEL_FAST = 'claude-haiku-4-5-20251001';
const MODEL_SMART = 'claude-sonnet-4-20250514';

const SYS_SCORE = `Stock scoring engine. Return ONLY valid JSON, no markdown.

SCORING RULES:
- 5 technical metrics, each 0-20: trend, momentum, volume, sr, volatility
- 5 fundamental metrics, each 0-20: growth, profitability, balance, cashflow, valuation
- tT = trend + momentum + volume + sr + volatility (max 100)
- fT = growth + profitability + balance + cashflow + valuation (max 100)
- wS = round(tT * wT / 100 + fT * wF / 100) (max 100)
- Verdict: 80-100=STRONG BUY, 60-79=BUY, 40-59=HOLD, 20-39=CAUTION, 0-19=AVOID

{"technical":{"trend":{"s":0,"n":""},"momentum":{"s":0,"n":""},"volume":{"s":0,"n":""},"sr":{"s":0,"n":""},"volatility":{"s":0,"n":""}},"fundamental":{"growth":{"s":0,"n":""},"profitability":{"s":0,"n":""},"balance":{"s":0,"n":""},"cashflow":{"s":0,"n":""},"valuation":{"s":0,"n":""}},"tT":0,"fT":0,"wS":0,"v":"","signals":["",""],"risks":["",""],"entry":"","stop":"","targets":[""]}
Notes max 6 words. Ensure tT and fT are correct sums.`;

const SYS_INTL_EST = `Financial data estimator. Return ONLY valid JSON, no markdown.
FORMAT: percentages as plain numbers (ROE=14%→14.0, ROA=1.3%→1.3). NEVER decimals (not 0.14). Ratios as-is (PE=21.5). marketCap in local currency integer. Banks: grossMargin=null, ROA 0.5-2%, ROE 8-15%.
IMPORTANT: If exact data is unknown, use realistic sector/industry averages — NEVER return all null fields. Always fill sector, industry, and at least pe, roe, netMargin with reasonable estimates.
{"ticker":"","name":"","exchange":"","marketCap":0,"pe":null,"pb":null,"evEbitda":null,"pFcf":null,"eps":null,"fcfPerShare":null,"fcfYield":null,"dividendYield":null,"payoutRatio":null,"roe":null,"roa":null,"roic":null,"netMargin":null,"grossMargin":null,"opMargin":null,"deRatio":null,"currentRatio":null,"sector":"","industry":"","beta":null}`;

const SYS_PARSE = `Extract stock data from the provided text. Return ONLY valid JSON, no markdown.
{"ticker":"","name":"","exchange":"","price":0,"change":0,"changePercent":0,"marketCap":0,"pe":null,"pb":null,"evEbitda":null,"eps":null,"dividendYield":null,"roe":null,"roa":null,"netMargin":null,"grossMargin":null,"opMargin":null,"deRatio":null,"currentRatio":null,"fcfPerShare":null,"high52":null,"low52":null,"sector":"","industry":"","beta":null,"_source":"claude"}
IMPORTANT: Look for ALL these labels in the text and extract their values:
- "Return on Equity" or "ROE" → roe (as %)
- "Return on Assets" or "ROA" → roa (as %)
- "Net Margin" or "Profit Margin" → netMargin (as %)
- "Gross Margin" → grossMargin (as %)
- "Operating Margin" → opMargin (as %)
- "Debt / Equity" or "D/E" → deRatio
- "Current Ratio" → currentRatio
- "Free Cash Flow Per Share" or "FCF/Share" → fcfPerShare
Convert percentages to numbers (25.3% → 25.3). Use null ONLY if truly not in text.`;

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    // ─── Phase 1: Raw data (FMP only) ───
    if (url.pathname === '/api/data' && request.method === 'POST') {
      try {
        const { ticker } = await request.json();
        if (!ticker) return resp({ error: 'Missing ticker' }, 400);
        const sym = ticker.toUpperCase();
        const intl = isIntlTicker(sym);

        const cachedFull = await kvGet(env, `full:${sym}`);
        // Skip stale intl cache entries that are missing fundamentals (old format)
        const intlCacheValid = !intl || (cachedFull && (cachedFull.pe != null || cachedFull.sector));
        // Skip AI-estimated cache that has no fundamentals at all (retry for better data)
        const aiNullCache = cachedFull?._aiEstimate && cachedFull.pe == null && cachedFull.roe == null && cachedFull.netMargin == null;
        if (cachedFull && intlCacheValid && !aiNullCache) {
          const cachedQuote = await kvGet(env, `quote:${sym}`);
          if (cachedQuote) { ctx.waitUntil(trackView(env, sym, cachedFull.name, cachedFull.market)); return resp({ ...cachedFull, ...cachedQuote }); }
          // Refresh live quote
          if (intl) {
            const fresh = await withTimeout(fetchFromYahoo(sym), 5000);
            if (fresh?.price) {
              const qd = { price: fresh.price, change: fresh.change, changePercent: fresh.changePercent, high52: fresh.high52, low52: fresh.low52 };
              await kvPut(env, `quote:${sym}`, qd, TTL_QUOTE);
              ctx.waitUntil(trackView(env, sym, cachedFull.name, cachedFull.market));
              return resp({ ...cachedFull, ...qd });
            }
          } else {
            const freshQuote = await fmpCall(`/quote?symbol=${sym}`, env.FMP_API_KEY);
            const q = first(freshQuote);
            if (q) {
              const quoteData = { price: q.price, change: rnd(q.change, 2), changePercent: rnd(q.changePercentage, 2), high52: q.yearHigh, low52: q.yearLow, volume: q.volume, priceAvg50: q.priceAvg50, priceAvg200: q.priceAvg200 };
              await kvPut(env, `quote:${sym}`, quoteData, TTL_QUOTE);
              ctx.waitUntil(trackView(env, sym, cachedFull.name, cachedFull.market));
              return resp({ ...cachedFull, ...quoteData });
            }
          }
          ctx.waitUntil(trackView(env, sym, cachedFull.name, cachedFull.market));
          return resp(cachedFull);
        }

        // International: Yahoo v8 (price) first, then Claude with company name
        if (intl) {
          const mi = getMarketInfo(sym);
          const yahooData = await withTimeout(fetchFromYahoo(sym), 8000);
          const companyName = yahooData?.name ? `"${yahooData.name}"` : '';
          const priceHint = yahooData?.price ? `, price ~${mi.currencySymbol}${yahooData.price}` : '';
          const aiData = await withTimeout(
            callClaude(env.ANTHROPIC_API_KEY, MODEL_FAST, SYS_INTL_EST,
              `Estimate all financial metrics for ${sym} ${companyName}${priceHint} on ${mi.market} (${mi.currency}). If exact data unavailable, use realistic sector averages.`, 400),
            12000
          );
          if (!yahooData?.price && !aiData) return resp({ error: 'Data unavailable', errorType: 'notfound', ticker: sym }, 404);
          const companyNameForFallback = yahooData?.name || sym;
          const ai = normalizeIntlFundamentals(aiData) || sectorFallback(sym, companyNameForFallback);
          const merged = {
            ticker: sym,
            name: yahooData?.name || ai?.name || sym,
            exchange: yahooData?.exchange || mi.market,
            currency: yahooData?.currency || mi.currency,
            market: mi.market, flag: mi.flag, currencySymbol: mi.currencySymbol,
            price: yahooData?.price ?? ai?.price,
            change: yahooData?.change ?? null,
            changePercent: yahooData?.changePercent ?? null,
            volume: yahooData?.volume ?? null,
            high52: yahooData?.high52 ?? ai?.high52,
            low52: yahooData?.low52 ?? ai?.low52,
            pe: ai?.pe, pb: ai?.pb, evEbitda: ai?.evEbitda, pFcf: ai?.pFcf,
            eps: ai?.eps, fcfPerShare: ai?.fcfPerShare, fcfYield: ai?.fcfYield,
            dividendYield: ai?.dividendYield, payoutRatio: ai?.payoutRatio,
            roe: ai?.roe, roa: ai?.roa, roic: ai?.roic,
            netMargin: ai?.netMargin, grossMargin: ai?.grossMargin, opMargin: ai?.opMargin,
            currentRatio: ai?.currentRatio, deRatio: ai?.deRatio,
            beta: ai?.beta, marketCap: ai?.marketCap, sector: ai?.sector || '',
            _source: yahooData?.price ? 'yahoo' : 'claude',
            _aiEstimate: true,
          };
          const { price, change, changePercent, high52, low52 } = merged;
          await kvPut(env, `full:${sym}`, merged, TTL_FUNDAMENTAL);
          await kvPut(env, `quote:${sym}`, { price, change, changePercent, high52, low52 }, TTL_QUOTE);
          ctx.waitUntil(trackView(env, sym, merged.name, merged.market));
          return resp(merged);
        }

        // US: FMP (with Yahoo+Claude fallback when FMP is rate-limited)
        const fmpData = await fetchFromFMP(sym, env.FMP_API_KEY);
        if (fmpData && !fmpData._error) {
          const { price, change, changePercent, high52, low52, volume, priceAvg50, priceAvg200, ...fundamental } = fmpData;
          const quoteData = { price, change, changePercent, high52, low52, volume, priceAvg50, priceAvg200 };
          await kvPut(env, `full:${sym}`, fmpData, TTL_FUNDAMENTAL);
          await kvPut(env, `quote:${sym}`, quoteData, TTL_QUOTE);
          ctx.waitUntil(trackView(env, sym, fmpData.name, fmpData.market));
          return resp(fmpData);
        }

        // FMP failed (limit/error) — fallback: Yahoo price first, then Claude with company name
        if (fmpData?._error === 'limit' || fmpData?._error === 'error' || !fmpData) {
          const mi = { market: 'US', flag: '🇺🇸', currencySymbol: '$', currency: 'USD' };
          const yahooData = await withTimeout(fetchFromYahoo(sym), 8000);
          const companyName = yahooData?.name ? `"${yahooData.name}"` : '';
          const priceHint = yahooData?.price ? `, price ~$${yahooData.price}` : '';
          const aiData = await withTimeout(
            callClaude(env.ANTHROPIC_API_KEY, MODEL_FAST, SYS_INTL_EST,
              `Estimate all financial metrics for ${sym} ${companyName}${priceHint} on US market (NYSE/NASDAQ, USD). If exact data unavailable, use realistic sector averages.`, 400),
            12000
          );
          if (!yahooData?.price && !aiData) return resp({ error: 'Data unavailable', errorType: 'notfound', ticker: sym }, 404);
          const companyNameUS = yahooData?.name || sym;
          const ai = normalizeIntlFundamentals(aiData) || sectorFallback(sym, companyNameUS);
          const merged = {
            ticker: sym,
            name: yahooData?.name || ai?.name || sym,
            exchange: yahooData?.exchange || 'NYSE/NASDAQ',
            currency: 'USD', market: 'US', flag: '🇺🇸', currencySymbol: '$',
            price: yahooData?.price ?? ai?.price,
            change: yahooData?.change ?? null,
            changePercent: yahooData?.changePercent ?? null,
            volume: yahooData?.volume ?? null,
            high52: yahooData?.high52 ?? ai?.high52,
            low52: yahooData?.low52 ?? ai?.low52,
            pe: ai?.pe, pb: ai?.pb, evEbitda: ai?.evEbitda, pFcf: ai?.pFcf,
            eps: ai?.eps, fcfPerShare: ai?.fcfPerShare, fcfYield: ai?.fcfYield,
            dividendYield: ai?.dividendYield, payoutRatio: ai?.payoutRatio,
            roe: ai?.roe, roa: ai?.roa, roic: ai?.roic,
            netMargin: ai?.netMargin, grossMargin: ai?.grossMargin, opMargin: ai?.opMargin,
            currentRatio: ai?.currentRatio, deRatio: ai?.deRatio,
            beta: ai?.beta, marketCap: ai?.marketCap, sector: ai?.sector || '',
            _source: yahooData?.price ? 'yahoo' : 'claude',
            _aiEstimate: true,
          };
          const { price, change, changePercent, high52, low52 } = merged;
          await kvPut(env, `full:${sym}`, merged, TTL_FUNDAMENTAL);
          await kvPut(env, `quote:${sym}`, { price, change, changePercent, high52, low52 }, TTL_QUOTE);
          ctx.waitUntil(trackView(env, sym, merged.name, merged.market));
          return resp(merged);
        }

        const errType = fmpData?._error || 'notfound';
        return resp({ error: 'FMP unavailable', errorType: errType, ticker: sym }, 404);
      } catch (e) { return resp({ error: e.message }, 500); }
    }

    // ─── Phase 1b: Scrape fallback ───
    if (url.pathname === '/api/fallback' && request.method === 'POST') {
      try {
        const { ticker } = await request.json();
        if (!ticker) return resp({ error: 'Missing ticker' }, 400);
        const sym = ticker.toUpperCase();

        const cached = await kvGet(env, `full:${sym}`);
        // Skip stale intl cache entries missing fundamentals (old format)
        const cachedValid = !isIntlTicker(sym) || (cached && (cached.pe != null || cached.sector));
        if (cached && cachedValid) return resp(cached);

        // International: Yahoo v8 (price) + Claude (fundamentals)
        if (isIntlTicker(sym)) {
          const mi = getMarketInfo(sym);
          const [yahooData, aiData] = await Promise.all([
            withTimeout(fetchFromYahoo(sym), 8000),
            withTimeout(
              callClaude(env.ANTHROPIC_API_KEY, MODEL_FAST, SYS_INTL_EST,
                `Estimate all metrics for ${sym} on ${mi.market} (${mi.currency}).`, 350),
              15000
            ),
          ]);
          if (!yahooData?.price && !aiData) return resp({ error: 'Data unavailable.', errorType: 'timeout' }, 504);
          const ai2 = normalizeIntlFundamentals(aiData);
          // Merge: Yahoo price (real) + Claude fundamentals (estimated)
          const merged = {
            ticker: sym,
            name: yahooData?.name || ai2?.name || sym,
            exchange: yahooData?.exchange || mi.market,
            currency: yahooData?.currency || mi.currency,
            market: mi.market, flag: mi.flag, currencySymbol: mi.currencySymbol,
            price: yahooData?.price ?? ai2?.price,
            change: yahooData?.change ?? null,
            changePercent: yahooData?.changePercent ?? null,
            volume: yahooData?.volume ?? null,
            high52: yahooData?.high52 ?? ai2?.high52,
            low52: yahooData?.low52 ?? ai2?.low52,
            // Fundamentals from Claude (normalized)
            pe: ai2?.pe, pb: ai2?.pb, evEbitda: ai2?.evEbitda, pFcf: ai2?.pFcf,
            eps: ai2?.eps, fcfPerShare: ai2?.fcfPerShare, fcfYield: ai2?.fcfYield,
            dividendYield: ai2?.dividendYield, payoutRatio: ai2?.payoutRatio,
            roe: ai2?.roe, roa: ai2?.roa, roic: ai2?.roic,
            netMargin: ai2?.netMargin, grossMargin: ai2?.grossMargin, opMargin: ai2?.opMargin,
            currentRatio: ai2?.currentRatio, deRatio: ai2?.deRatio,
            beta: ai2?.beta, marketCap: ai2?.marketCap, sector: ai2?.sector || '',
            _source: yahooData?.price ? 'yahoo' : 'claude',
            _aiEstimate: true,
          };
          await kvPut(env, `full:${sym}`, merged, TTL_FUNDAMENTAL);
          return resp(merged);
        }

        // US stocks: Scrape 4 pages from stockanalysis.com
        const sl = sym.toLowerCase();
        const [p1, p2, p3, p4] = await Promise.all([
          fetchPage(`https://stockanalysis.com/stocks/${sl}/`),
          fetchPage(`https://stockanalysis.com/stocks/${sl}/financials/ratios/`),
          fetchPage(`https://stockanalysis.com/stocks/${sl}/financials/`),
          fetchPage(`https://stockanalysis.com/stocks/${sl}/financials/balance-sheet/`),
        ]);

        // Each page already filtered to financial data only (max 3000 chars each)
        const parts = [p1, p2, p3, p4].filter(Boolean);
        const combined = parts.join('\n---PAGE---\n');

        if (!combined || combined.length < 50) {
          return resp({ error: 'Could not fetch data.', errorType: 'scrape_fail' }, 404);
        }

        // Trim total to 4000 chars (~1000 tokens) — all high-quality financial text
        const trimmed = combined.substring(0, 4000);

        if (!combined || combined.length < 100) {
          return resp({ error: 'Could not fetch data.', errorType: 'scrape_fail' }, 404);
        }

        const parsed = await withTimeout(
          callClaude(env.ANTHROPIC_API_KEY, MODEL_FAST, SYS_PARSE,
            `Extract ALL metrics for ${sym} from this pre-filtered financial data:\n\n${trimmed}`, 400),
          18000
        );

        if (!parsed) return resp({ error: 'AI parse timeout.', errorType: 'timeout' }, 504);

        parsed._source = 'claude';
        parsed.ticker = parsed.ticker || sym;
        await kvPut(env, `full:${sym}`, parsed, TTL_FUNDAMENTAL);
        return resp(parsed);
      } catch (e) { return resp({ error: e.message }, 500); }
    }

    // ─── Phase 2: AI scoring ───
    if (url.pathname === '/api/analyze' && request.method === 'POST') {
      try {
        const { ticker, metrics, periodDays } = await request.json();
        if (!ticker) return resp({ error: 'Missing ticker' }, 400);
        const days = periodDays || 90;
        const wc = WEIGHTS[days] || WEIGHTS[90];
        const cacheKey = `score:${ticker.toUpperCase()}:${days}`;

        const cached = await kvGet(env, cacheKey);
        if (cached) return resp(cached);

        const prompt = `${ticker} ${days}d wT=${wc.wT} wF=${wc.wF} PE=${metrics.pe} PB=${metrics.pb} EV=${metrics.evEbitda} ROE=${metrics.roe} ROA=${metrics.roa} NM=${metrics.netMargin} GM=${metrics.grossMargin} OM=${metrics.opMargin} DE=${metrics.deRatio} CR=${metrics.currentRatio} FCF=${metrics.fcfPerShare} DY=${metrics.dividendYield} 52H=${metrics.high52} 52L=${metrics.low52} P=${metrics.price} Beta=${metrics.beta} Sector=${metrics.sector}`;

        let result = await withTimeout(callClaude(env.ANTHROPIC_API_KEY, MODEL_FAST, SYS_SCORE, prompt, 512), 20000);
        if (!result) {
          result = await withTimeout(callClaude(env.ANTHROPIC_API_KEY, MODEL_SMART, SYS_SCORE, prompt, 512), 25000);
        }
        if (!result) return resp({ error: 'Claude scoring timeout' }, 502);

        const t = result.technical || {};
        const f = result.fundamental || {};
        result.tT = (t.trend?.s||0) + (t.momentum?.s||0) + (t.volume?.s||0) + (t.sr?.s||0) + (t.volatility?.s||0);
        result.fT = (f.growth?.s||0) + (f.profitability?.s||0) + (f.balance?.s||0) + (f.cashflow?.s||0) + (f.valuation?.s||0);
        result.wS = Math.round(result.tT * wc.wT / 100 + result.fT * wc.wF / 100);
        if (result.wS >= 80) result.v = 'STRONG BUY';
        else if (result.wS >= 60) result.v = 'BUY';
        else if (result.wS >= 40) result.v = 'HOLD';
        else if (result.wS >= 20) result.v = 'CAUTION';
        else result.v = 'AVOID';

        result.wT = wc.wT;
        result.wF = wc.wF;
        await kvPut(env, cacheKey, result, TTL_SCORE);
        return resp(result);
      } catch (e) { return resp({ error: e.message }, 500); }
    }

    // ─── Phase 3: Industry peers ───
    if (url.pathname === '/api/peers' && request.method === 'POST') {
      try {
        const { ticker } = await request.json();
        if (!ticker) return resp({ peers: [], avg: {} });
        const sym = ticker.toUpperCase();
        const cacheKey = `peers:${sym}`;

        const cached = await kvGet(env, cacheKey);
        if (cached) return resp(cached);

        const peersRaw = await fmpCall(`/stock-peers?symbol=${sym}`, env.FMP_API_KEY);
        if (!Array.isArray(peersRaw) || !peersRaw.length) return resp({ peers: [], avg: {} });

        const peerTickers = peersRaw.filter(p => p.symbol && p.symbol !== sym).slice(0, 3).map(p => p.symbol);
        if (!peerTickers.length) return resp({ peers: [], avg: {} });

        const peerRows = await Promise.all(peerTickers.map(async (s) => {
          const [qt, rt, mt] = await Promise.all([
            fmpCall(`/quote?symbol=${s}`, env.FMP_API_KEY),
            fmpCall(`/ratios-ttm?symbol=${s}`, env.FMP_API_KEY),
            fmpCall(`/key-metrics-ttm?symbol=${s}`, env.FMP_API_KEY),
          ]);
          const q = first(qt) || {}, r = first(rt) || {}, m = first(mt) || {};
          return {
            ticker: s, name: q.name || s, price: q.price, marketCap: q.marketCap,
            pe: rnd(r.priceToEarningsRatioTTM), pb: rnd(r.priceToBookRatioTTM, 2),
            evEbitda: rnd(r.enterpriseValueMultipleTTM),
            roe: rnd(m.returnOnEquityTTM * 100, 1), roa: rnd(m.returnOnAssetsTTM * 100, 1),
            netMargin: rnd(r.netProfitMarginTTM * 100, 1),
            grossMargin: rnd(r.grossProfitMarginTTM * 100, 1),
            deRatio: rnd(r.debtToEquityRatioTTM, 2),
            dividendYield: rnd(r.dividendYieldTTM * 100, 2),
          };
        }));

        const valid = peerRows.filter(p => p.price != null);
        const avg = {};
        ['pe', 'pb', 'evEbitda', 'roe', 'roa', 'netMargin', 'grossMargin', 'deRatio', 'dividendYield'].forEach(k => {
          const vals = valid.map(p => p[k]).filter(v => v != null);
          if (vals.length) avg[k] = rnd(vals.reduce((a, b) => a + b, 0) / vals.length, 1);
        });

        const result = { peers: valid, avg };
        await kvPut(env, cacheKey, result, TTL_PEERS);
        return resp(result);
      } catch (e) { return resp({ error: e.message, peers: [], avg: {} }, 200); }
    }

    // ─── AI Picks (3 markets/day, cache 24hr) ───
    if (url.pathname === '/api/picks' && (request.method === 'GET' || request.method === 'POST')) {
      try {
        const cacheKey = 'picks:daily';
        const cached = await kvGet(env, cacheKey);
        if (cached) return resp(cached);

        // Curated blue-chip + momentum stocks per market
        const US_POOL  = ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AVGO','AMD','NFLX','JPM','V','LLY','UNH','XOM'];
        const SET_POOL = ['PTT.BK','KBANK.BK','SCB.BK','CPALL.BK','DELTA.BK','AOT.BK','BDMS.BK','BBL.BK','GULF.BK','KTB.BK','PTTEP.BK','ADVANC.BK','SCC.BK','BTS.BK','TRUE.BK'];
        const HK_POOL  = ['0700.HK','9988.HK','1211.HK','2318.HK','3690.HK','0005.HK','0941.HK','1024.HK','2628.HK','0388.HK'];

        // Fetch: US gainers (scrape) + US, SET & HK quotes (Yahoo v8 chart) — all in parallel
        const [usGainers, usActive, ...allQuotes] = await Promise.all([
          fetchPage('https://stockanalysis.com/markets/gainers/'),
          fetchPage('https://stockanalysis.com/markets/active/'),
          ...([...US_POOL, ...SET_POOL, ...HK_POOL].map(sym => withTimeout(fetchFromYahoo(sym), 5000))),
        ]);

        // Sort each market by changePercent, take top movers
        const allIntl = allQuotes.filter(Boolean);
        const usTop  = allIntl.filter(q => !q.ticker.endsWith('.BK') && !q.ticker.endsWith('.HK')).sort((a, b) => (b.changePercent||0) - (a.changePercent||0)).slice(0, 5);
        const setTop = allIntl.filter(q => q.ticker.endsWith('.BK')).sort((a, b) => (b.changePercent||0) - (a.changePercent||0)).slice(0, 5);
        const hkTop  = allIntl.filter(q => q.ticker.endsWith('.HK')).sort((a, b) => (b.changePercent||0) - (a.changePercent||0)).slice(0, 5);

        const usText  = [usGainers, usActive].filter(Boolean).join('\n').substring(0, 1500);
        const setText = setTop.map(q => `${q.ticker} ${q.name} price=${q.price} chg=${q.changePercent}%`).join('\n');
        const hkText  = hkTop.map(q => `${q.ticker} ${q.name} price=${q.price} chg=${q.changePercent}%`).join('\n');

        const prompt = `Pick exactly 5 stocks worth watching today — at least 1 from each market (US, SET, HKEX), distribute the remaining 2 picks to whichever markets have the most opportunity today.

OUTPUT: ONLY a JSON array of exactly 5 objects, no markdown.
[{"ticker":"","name":"","price":0,"changePercent":0,"sector":"","market":"US","flag":"🇺🇸","currencySymbol":"$","risk":"aggressive","riskLevel":3,"reason":"max 10 words","emoji":""}]

market: "US" | "SET" | "HKEX"
flag: 🇺🇸 for US, 🇹🇭 for SET, 🇭🇰 for HKEX
currencySymbol: "$" for US, "฿" for SET, "HK$" for HKEX
risk: "aggressive" | "balanced" | "conservative"  riskLevel: 3=aggressive, 2=balanced, 1=conservative
emoji: sector emoji (💻🏥⚡🏭🏦🛒🏗️✈️)
reason: punchy max 10 words

🇺🇸 US top movers:
${usText}

🇹🇭 SET top movers:
${setText || 'PTT.BK KBANK.BK DELTA.BK CPALL.BK AOT.BK (use your knowledge)'}

🇭🇰 HKEX top movers:
${hkText || '0700.HK 9988.HK 1211.HK 2318.HK 3690.HK (use your knowledge)'}`;

        const picks = await withTimeout(
          callClaude(env.ANTHROPIC_API_KEY, MODEL_FAST, 'Return ONLY valid JSON array of exactly 5 items. No markdown.', prompt, 600),
          18000
        );

        const date = new Date().toISOString().split('T')[0];

        if (picks && Array.isArray(picks) && picks.length > 0) {
          // Enrich with real-time price from Yahoo if available
          const enriched = picks.map(pick => {
            const live = allIntl.find(q => q.ticker === pick.ticker);
            if (live) return { ...pick, price: live.price, changePercent: live.changePercent };
            return pick;
          });
          const result = { picks: enriched, date, source: 'claude', model: MODEL_FAST };
          await kvPut(env, cacheKey, result, TTL_PICKS);
          return resp(result);
        }

        // Fallback: build picks deterministically from top movers when Claude is unavailable
        const fallback = buildPicksFallback(usTop, setTop, hkTop);
        if (fallback.length > 0) {
          const result = { picks: fallback, date, source: 'fallback', model: null };
          await kvPut(env, cacheKey, result, TTL_PICKS);
          return resp(result);
        }

        return resp({ picks: [], date: null });
      } catch (e) { return resp({ picks: [], error: e.message }); }
    }

    // ─── AI Watchlist: AI-related stocks ranked by P/E + fundamentals ───
    if (url.pathname === '/api/watchlist' && (request.method === 'GET' || request.method === 'POST')) {
      try {
        const cacheKey = 'watchlist:daily';
        const cached = await kvGet(env, cacheKey);
        if (cached) return resp(cached);

        // Curated AI-related US tickers (chips, hyperscalers, AI software, infra)
        const AI_POOL = ['NVDA','GOOGL','MSFT','META','AMD','AVGO','TSM','PLTR','ANET','SMCI','ORCL','CRM','IBM','ADBE','NOW','AMZN','AAPL','SNOW','MDB','CRWD'];

        // Fetch Yahoo quote + FMP ratios in parallel for every ticker
        const enriched = await Promise.all(AI_POOL.map(async (sym) => {
          const [yq, ratios, profile] = await Promise.all([
            withTimeout(fetchFromYahoo(sym), 5000),
            withTimeout(fmpCall(`/ratios-ttm?symbol=${sym}`, env.FMP_API_KEY), 5000),
            withTimeout(fmpCall(`/profile?symbol=${sym}`, env.FMP_API_KEY), 5000),
          ]);
          const ratio = first(ratios);
          const prof = first(profile);
          if (!yq?.price) return null;
          return {
            ticker: sym,
            name: yq.name || prof?.companyName || sym,
            price: yq.price,
            changePercent: yq.changePercent,
            pe: ratio?.priceToEarningsRatioTTM != null ? rnd(ratio.priceToEarningsRatioTTM, 1) : null,
            roe: ratio?.returnOnEquityTTM != null ? rnd(ratio.returnOnEquityTTM * 100, 1) : null,
            netMargin: ratio?.netProfitMarginTTM != null ? rnd(ratio.netProfitMarginTTM * 100, 1) : null,
            deRatio: ratio?.debtEquityRatioTTM != null ? rnd(ratio.debtEquityRatioTTM, 2) : null,
            sector: prof?.sector || 'Technology',
            industry: prof?.industry || '',
          };
        }));

        const candidates = enriched.filter(Boolean);
        if (candidates.length === 0) return resp({ picks: [], date: null });

        const date = new Date().toISOString().split('T')[0];

        // Build compact summary for Claude
        const summary = candidates.map(c =>
          `${c.ticker} ${c.name} | PE=${c.pe ?? 'n/a'} ROE=${c.roe ?? 'n/a'}% NetMgn=${c.netMargin ?? 'n/a'}% D/E=${c.deRatio ?? 'n/a'} | ${c.industry || c.sector}`
        ).join('\n');

        const prompt = `Pick exactly 5 AI-related US stocks worth watching, ranked primarily by attractive P/E ratio with reasonable ROE and stable margins. Avoid extreme outliers (PE>80 or negative).

OUTPUT: ONLY a JSON array of exactly 5 objects, no markdown.
[{"ticker":"","reason":"PE-focused, max 12 words","emoji":"🤖"}]

reason: must reference the P/E specifically (e.g. "PE 22 looks cheap for 30% ROE", "Premium PE 45 but dominant AI moat"). Max 12 words.
emoji: pick one of 🤖 💻 ⚡ 🧠 ☁️ 🔌

Candidates:
${summary}`;

        const ranked = await withTimeout(
          callClaude(env.ANTHROPIC_API_KEY, MODEL_FAST, 'Return ONLY valid JSON array of exactly 5 items. No markdown.', prompt, 500),
          15000
        );

        const byTicker = Object.fromEntries(candidates.map(c => [c.ticker, c]));

        if (ranked && Array.isArray(ranked) && ranked.length > 0) {
          const picks = ranked
            .map(r => {
              const c = byTicker[r.ticker];
              if (!c) return null;
              return { ...c, reason: r.reason || `PE ${c.pe ?? 'n/a'}`, emoji: r.emoji || '🤖' };
            })
            .filter(Boolean);
          if (picks.length > 0) {
            const result = { picks, date, source: 'claude', model: MODEL_FAST };
            await kvPut(env, cacheKey, result, TTL_WATCH);
            return resp(result);
          }
        }

        // Fallback: lowest PE with positive ROE
        const fallback = candidates
          .filter(c => c.pe != null && c.pe > 0 && c.pe < 80 && (c.roe == null || c.roe > 0))
          .sort((a, b) => (a.pe || 999) - (b.pe || 999))
          .slice(0, 5)
          .map(c => ({ ...c, reason: `PE ${c.pe} · ROE ${c.roe ?? 'n/a'}%`, emoji: '🤖' }));

        if (fallback.length > 0) {
          const result = { picks: fallback, date, source: 'fallback', model: null };
          await kvPut(env, cacheKey, result, TTL_WATCH);
          return resp(result);
        }

        return resp({ picks: [], date: null });
      } catch (e) { return resp({ picks: [], error: e.message }); }
    }

    // ─── Portfolio Consult (enhanced AI + counter + stats) ───
    if (url.pathname === '/api/consult' && request.method === 'POST') {
      try {
        const { goal, risk, riskLabel, period, inputMode, portfolio, image, imageMime } = await request.json();

        const systemPrompt = `You are an expert portfolio consultant. Analyze thoroughly using ALL user context.
Return ONLY valid JSON, absolutely no markdown, no code fences, no text before or after.
{"portfolioGrade":"B","summary":"3-4 sentence personalized overview referencing user's goal and period","riskAssessment":{"current":0,"target":0,"note":"specific note about gap"},"sectorBreakdown":[{"sector":"","pct":0}],"issues":["specific issue with data"],"recommendations":["actionable step with ticker"],"suggestedStocks":[{"ticker":"","name":"","reason":"why it fits this user's goal"}],"targetAllocation":[{"asset":"TICKER/ETF","pct":0,"reason":""}]}
Rules:
- portfolioGrade: A/B/C/D/F based on fit to user's goal+risk+period
- USE the user's goal, risk level, and period to personalize every recommendation
- sectorBreakdown: estimate sector weights from holdings (pct values must sum to 100)
- issues: 2-4 problems found (over-concentration, risk mismatch, missing diversification)
- recommendations: 4-6 specific actionable steps with real tickers
- suggestedStocks: 3-4 stocks/ETFs that specifically match this user's goal+risk+period
- targetAllocation: 5-7 items, pct values must sum to exactly 100, each with reason
- Be specific, use real tickers, reference user's stated preferences
- Keep all string values concise (under 120 chars) to avoid truncation`;

        let userMessage = `MY PROFILE:
- Goal: ${goal}
- Risk tolerance: ${risk}/10 (${riskLabel})
- Investment period: ${period}

MY CURRENT PORTFOLIO:
`;

        const messages = [];

        if (inputMode === 'manual' && portfolio) {
          userMessage += portfolio;
          messages.push({ role: 'user', content: userMessage });
        } else if (inputMode === 'upload' && image) {
          messages.push({
            role: 'user',
            content: [
              { type: 'text', text: userMessage + 'See my portfolio screenshot below. Read ALL holdings with shares and costs.' },
              { type: 'image', source: { type: 'base64', media_type: imageMime || 'image/jpeg', data: image } },
            ],
          });
        } else {
          return resp({ error: 'No portfolio data provided' }, 400);
        }

        const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: MODEL_SMART, max_tokens: 1600, system: systemPrompt, messages }),
        });

        if (!apiRes.ok) return resp({ error: 'AI analysis failed' }, 502);
        const body = await apiRes.json();
        const txt = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        if (!txt) return resp({ error: 'Empty AI response' }, 502);
        const parsed = extractJSON(txt);

        // Track usage counter + stats (fire and forget)
        trackConsultUsage(env, parsed.holdings || [], goal, risk, period);

        return resp(parsed);
      } catch (e) { return resp({ error: e.message }, 500); }
    }

    // ─── Stock views stats ───
    if (url.pathname === '/api/views' && request.method === 'GET') {
      try {
        const views = (await kvGet(env, 'stats:stock_views')) || {};
        const sorted = Object.entries(views)
          .map(([ticker, v]) => ({ ticker, name: v.name, market: v.market, count: v.count, last: v.last }))
          .sort((a, b) => b.count - a.count);
        return resp({ total: sorted.reduce((s, r) => s + r.count, 0), stocks: sorted });
      } catch (e) { return resp({ error: e.message }, 500); }
    }

    // ─── Consult counter ───
    if (url.pathname === '/api/consult-stats' && (request.method === 'GET' || request.method === 'POST')) {
      try {
        const count = await kvGet(env, 'stats:consult_count') || 0;
        const topStocks = await kvGet(env, 'stats:top_stocks') || {};
        return resp({ count, topStocks });
      } catch { return resp({ count: 0, topStocks: {} }); }
    }

    // ─── Clear cache ───
    if (url.pathname === '/api/clear-cache' && request.method === 'POST') {
      try {
        const { ticker } = await request.json();
        if (!ticker) return resp({ error: 'Missing ticker' }, 400);
        const sym = ticker.toUpperCase();
        await Promise.all([
          kvDel(env, `full:${sym}`), kvDel(env, `quote:${sym}`), kvDel(env, `peers:${sym}`),
          kvDel(env, `score:${sym}:7`), kvDel(env, `score:${sym}:14`),
          kvDel(env, `score:${sym}:30`), kvDel(env, `score:${sym}:90`),
          kvDel(env, `score:${sym}:180`), kvDel(env, `score:${sym}:365`),
          kvDel(env, `score:${sym}:730`), kvDel(env, `score:${sym}:1825`),
        ]);
        return resp({ ok: true, cleared: sym });
      } catch (e) { return resp({ error: e.message }, 500); }
    }

    // ─── Stats (internal admin) ───
    if (url.pathname === '/api/stats' && request.method === 'GET') {
      try {
        const count = await kvGet(env, 'stats:consult_count') || 0;
        const topStocks = await kvGet(env, 'stats:top_stocks') || {};
        const dist = await kvGet(env, 'stats:distribution') || {};
        const sorted = Object.entries(topStocks).sort((a, b) => b[1] - a[1]);
        return resp({ consultCount: count, topHoldings: sorted, distribution: dist });
      } catch (e) { return resp({ error: e.message }, 500); }
    }

    // ─── Usage counter (public) ───
    if (url.pathname === '/api/counter' && request.method === 'GET') {
      try {
        const count = await kvGet(env, 'stats:consult_count') || 0;
        return resp({ count });
      } catch { return resp({ count: 0 }); }
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};

// ═══ Track stock views ═══
async function trackView(env, ticker, name, market) {
  try {
    const views = (await kvGet(env, 'stats:stock_views')) || {};
    const t = ticker.toUpperCase();
    views[t] = { count: ((views[t]?.count) || 0) + 1, name: name || t, market: market || 'US', last: Date.now() };
    await kvPut(env, 'stats:stock_views', views, 86400 * 365);
  } catch { /* silent */ }
}

// ═══ Track consult usage + stock popularity ═══
async function trackConsultUsage(env, holdings, goal, risk, period) {
  try {
    // Increment counter
    const count = (await kvGet(env, 'stats:consult_count')) || 0;
    await kvPut(env, 'stats:consult_count', count + 1, 86400 * 365);

    // Track stock popularity
    const topStocks = (await kvGet(env, 'stats:top_stocks')) || {};
    holdings.forEach(h => {
      if (h.ticker) {
        const t = h.ticker.toUpperCase();
        topStocks[t] = (topStocks[t] || 0) + 1;
      }
    });
    await kvPut(env, 'stats:top_stocks', topStocks, 86400 * 365);

    // Track goal/risk/period distribution
    const dist = (await kvGet(env, 'stats:distribution')) || { goals: {}, risks: {}, periods: {} };
    if (goal) dist.goals[goal] = (dist.goals[goal] || 0) + 1;
    if (risk) dist.risks[risk] = (dist.risks[risk] || 0) + 1;
    if (period) dist.periods[period] = (dist.periods[period] || 0) + 1;
    await kvPut(env, 'stats:distribution', dist, 86400 * 365);
  } catch { /* silent fail — don't block response */ }
}

// ═══ Scrape page → extract ONLY financial data lines ═══
async function fetchPage(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
    if (!r.ok) return null;
    const html = await r.text();

    // Method 1: Try to find embedded JSON data (stockanalysis uses __NEXT_DATA__)
    const jsonMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      try {
        const nextData = JSON.parse(jsonMatch[1]);
        // Extract just the text representation — compact
        const flat = JSON.stringify(nextData).substring(0, 8000);
        return extractFinancialText(flat);
      } catch { /* fall through to HTML method */ }
    }

    // Method 2: Strip HTML → keep only lines with financial data
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();

    return extractFinancialText(text);
  } catch { return null; }
}

// Keep only text chunks that contain financial keywords or numbers
function extractFinancialText(text) {
  const keywords = /market cap|price|p\/e|pe ratio|eps|earning|revenue|income|margin|gross|operating|net |ebitda|roe|roa|roic|debt|equity|d\/e|current ratio|quick ratio|dividend|yield|payout|fcf|free cash|beta|52.?week|52w|high|low|sector|industry|book value|p\/b|ev\/|enterprise|cash flow|shares|volume|change/i;

  // Split into chunks and filter for financial relevance
  const chunks = text.split(/[.\n]+/).filter(chunk => {
    const trimmed = chunk.trim();
    if (trimmed.length < 3 || trimmed.length > 200) return false;
    // Must contain a number AND a financial keyword
    return /\d/.test(trimmed) && keywords.test(trimmed);
  });

  // Also grab key-value pairs like "P/E Ratio 48.24"
  const kvPairs = text.match(/(?:[\w\/\s]{2,30})\s*[:=]?\s*[\-]?\d[\d,.%]*(?:\s*[BMKTbmkt])?/g) || [];
  const filteredKV = kvPairs.filter(kv => keywords.test(kv));

  const combined = [...new Set([...chunks, ...filteredKV])].join(' | ');
  return combined.substring(0, 3000);
}

// ═══ Robust JSON extractor ═══
function extractJSON(text) {
  // Strip markdown code fences
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Try direct parse first
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  // Find the outermost { ... } block
  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in response');
  // Walk forward to find matching closing brace
  let depth = 0, inStr = false, escape = false, end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inStr) { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) {
    // JSON was truncated — try to close open braces/arrays
    let fixed = cleaned.substring(start);
    // Count unclosed brackets
    let od = 0, oa = 0, os = false, oe = false;
    for (const c of fixed) {
      if (oe) { oe = false; continue; }
      if (c === '\\' && os) { oe = true; continue; }
      if (c === '"') { os = !os; continue; }
      if (os) continue;
      if (c === '{') od++; else if (c === '}') od--;
      else if (c === '[') oa++; else if (c === ']') oa--;
    }
    // Remove trailing comma if present
    fixed = fixed.replace(/,\s*$/, '');
    // Close open arrays then objects
    fixed += ']'.repeat(Math.max(0, oa)) + '}'.repeat(Math.max(0, od));
    try { return JSON.parse(fixed); } catch { throw new Error('Could not repair truncated JSON'); }
  }
  return JSON.parse(cleaned.substring(start, end + 1));
}

// ═══ KV ═══
async function kvGet(env, key) { try { if (!env.CACHE) return null; return await env.CACHE.get(key, 'json'); } catch { return null; } }
async function kvPut(env, key, data, ttl) { try { if (!env.CACHE) return; await env.CACHE.put(key, JSON.stringify(data), { expirationTtl: ttl }); } catch { } }
async function kvDel(env, key) { try { if (!env.CACHE) return; await env.CACHE.delete(key); } catch { } }

// ═══ Timeout ═══
function withTimeout(promise, ms) { return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(null), ms))]); }

// ═══ FMP ═══
async function fetchFromFMP(ticker, apiKey) {
  const [quote, profile, ratios, metrics, income] = await Promise.all([
    fmpCall(`/quote?symbol=${ticker}`, apiKey), fmpCall(`/profile?symbol=${ticker}`, apiKey),
    fmpCall(`/ratios-ttm?symbol=${ticker}`, apiKey), fmpCall(`/key-metrics-ttm?symbol=${ticker}`, apiKey),
    fmpCall(`/income-statement?symbol=${ticker}&period=annual&limit=2`, apiKey),
  ]);
  if ([quote,profile,ratios,metrics,income].some(r => r && r._fmpError === 'premium')) return { _error: 'premium' };
  if ([quote,profile,ratios,metrics,income].some(r => r && r._fmpError === 'limit')) return { _error: 'limit' };
  const q = first(quote), p = first(profile), r = first(ratios) || {}, m = first(metrics) || {};
  if (!q || !q.symbol) return null;
  const ic0 = (Array.isArray(income) && income[0]) || {}, ic1 = (Array.isArray(income) && income[1]) || {};
  return {
    ticker: q.symbol, name: q.name || p?.companyName || q.symbol,
    exchange: q.exchange || p?.exchange || '', price: q.price,
    change: rnd(q.change, 2), changePercent: rnd(q.changePercentage, 2), marketCap: q.marketCap,
    pe: rnd(r.priceToEarningsRatioTTM), pb: rnd(r.priceToBookRatioTTM, 2),
    ps: rnd(r.priceToSalesRatioTTM, 2), evEbitda: rnd(r.enterpriseValueMultipleTTM),
    pFcf: rnd(r.priceToFreeCashFlowRatioTTM), eps: rnd(r.netIncomePerShareTTM, 2),
    dividendYield: rnd(r.dividendYieldTTM * 100, 2), payoutRatio: rnd(r.dividendPayoutRatioTTM * 100, 1),
    dividendPerShare: rnd(r.dividendPerShareTTM, 2),
    roe: rnd(m.returnOnEquityTTM * 100, 1), roa: rnd(m.returnOnAssetsTTM * 100, 1),
    roic: rnd(m.returnOnInvestedCapitalTTM * 100, 1),
    netMargin: rnd(r.netProfitMarginTTM * 100, 1), grossMargin: rnd(r.grossProfitMarginTTM * 100, 1),
    opMargin: rnd(r.operatingProfitMarginTTM * 100, 1), ebitdaMargin: rnd(r.ebitdaMarginTTM * 100, 1),
    deRatio: rnd(r.debtToEquityRatioTTM, 2), currentRatio: rnd(r.currentRatioTTM, 2),
    quickRatio: rnd(r.quickRatioTTM, 2), fcfPerShare: rnd(r.freeCashFlowPerShareTTM, 2),
    fcfYield: rnd(m.freeCashFlowYieldTTM * 100, 2), ocfPerShare: rnd(r.operatingCashFlowPerShareTTM, 2),
    high52: q.yearHigh, low52: q.yearLow,
    avgVolume: q.avgVolume || p?.averageVolume, volume: q.volume,
    priceAvg50: q.priceAvg50, priceAvg200: q.priceAvg200,
    sector: p?.sector || '', industry: p?.industry || '', beta: rnd(p?.beta, 2),
    incomeStatement: {
      fiscalYear: ic0.fiscalYear || '', priorYear: ic1.fiscalYear || '',
      revenue: ic0.revenue, revenuePrior: ic1.revenue, revenueGrowth: grow(ic0.revenue, ic1.revenue),
      cogs: ic0.costOfRevenue, cogsPrior: ic1.costOfRevenue, cogsGrowth: grow(ic0.costOfRevenue, ic1.costOfRevenue),
      grossProfit: ic0.grossProfit, grossProfitPrior: ic1.grossProfit, grossProfitGrowth: grow(ic0.grossProfit, ic1.grossProfit),
      rd: ic0.researchAndDevelopmentExpenses, rdPrior: ic1.researchAndDevelopmentExpenses, rdGrowth: grow(ic0.researchAndDevelopmentExpenses, ic1.researchAndDevelopmentExpenses),
      sga: ic0.sellingGeneralAndAdministrativeExpenses, sgaPrior: ic1.sellingGeneralAndAdministrativeExpenses, sgaGrowth: grow(ic0.sellingGeneralAndAdministrativeExpenses, ic1.sellingGeneralAndAdministrativeExpenses),
      opex: ic0.operatingExpenses, opexPrior: ic1.operatingExpenses, opexGrowth: grow(ic0.operatingExpenses, ic1.operatingExpenses),
      opIncome: ic0.operatingIncome, opIncomePrior: ic1.operatingIncome, opIncomeGrowth: grow(ic0.operatingIncome, ic1.operatingIncome),
      netIncome: ic0.netIncome, netIncomePrior: ic1.netIncome, netIncomeGrowth: grow(ic0.netIncome, ic1.netIncome),
      ebitda: ic0.ebitda, ebitdaPrior: ic1.ebitda, ebitdaGrowth: grow(ic0.ebitda, ic1.ebitda),
    },
    _source: 'fmp',
  };
}

// ═══ Claude (no web search) ═══
async function callClaude(apiKey, model, systemPrompt, userMessage, maxTokens) {
  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] }),
    });
    if (!apiRes.ok) return null;
    const body = await apiRes.json();
    const txt = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (!txt) return null;
    const clean = txt.replace(/```json|```/g, '').trim();
    try { return JSON.parse(clean); } catch {}
    // Bracket-counting extractor: handles text before/after JSON
    const s0 = clean.indexOf('['), s1 = clean.indexOf('{');
    const start = (s0 >= 0 && s1 >= 0) ? Math.min(s0, s1) : Math.max(s0, s1);
    if (start < 0) return null;
    const open = clean[start], close = open === '[' ? ']' : '}';
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < clean.length; i++) {
      const c = clean[i];
      if (esc) { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === open) depth++;
      if (c === close && --depth === 0) { try { return JSON.parse(clean.slice(start, i + 1)); } catch { break; } }
    }
    return null;
  } catch { return null; }
}

// Infer basic sector estimates from company name when Claude returns null
function sectorFallback(ticker, name) {
  const n = (name || ticker || '').toLowerCase();
  // Sector detection from name keywords
  const sector =
    /educat|school|learn|academy|tutoring|university/.test(n) ? 'Education' :
    /bank|financ|capital|invest|insurance|asset/.test(n) ? 'Financials' :
    /tech|software|cloud|data|cyber|digital|ai |intel/.test(n) ? 'Technology' :
    /health|pharma|medic|biotech|hospital|therapeut/.test(n) ? 'Healthcare' :
    /energy|oil|gas|power|solar|renew/.test(n) ? 'Energy' :
    /real estate|reit|property/.test(n) ? 'Real Estate' :
    /retail|consumer|food|beverage|restaurant/.test(n) ? 'Consumer' :
    /mining|material|chemical|steel|metal/.test(n) ? 'Materials' : 'Other';

  // Sector median estimates
  const defaults = {
    Education:   { pe: 18, pb: 2.0, roe: 12, roa: 6,  netMargin: 8,  grossMargin: 55, opMargin: 10, deRatio: 0.4, currentRatio: 1.8, beta: 1.1 },
    Financials:  { pe: 12, pb: 1.2, roe: 10, roa: 1.0, netMargin: 18, grossMargin: null, opMargin: 25, deRatio: 3.0, currentRatio: null, beta: 1.0 },
    Technology:  { pe: 28, pb: 5.0, roe: 18, roa: 10, netMargin: 15, grossMargin: 60, opMargin: 18, deRatio: 0.5, currentRatio: 2.5, beta: 1.3 },
    Healthcare:  { pe: 22, pb: 3.5, roe: 14, roa: 7,  netMargin: 12, grossMargin: 58, opMargin: 14, deRatio: 0.6, currentRatio: 2.0, beta: 0.8 },
    Energy:      { pe: 14, pb: 1.8, roe: 12, roa: 5,  netMargin: 10, grossMargin: 35, opMargin: 12, deRatio: 0.8, currentRatio: 1.5, beta: 1.2 },
    'Real Estate':{ pe: 20, pb: 1.5, roe: 8,  roa: 3,  netMargin: 20, grossMargin: 50, opMargin: 22, deRatio: 1.5, currentRatio: 1.2, beta: 0.7 },
    Consumer:    { pe: 20, pb: 3.0, roe: 15, roa: 7,  netMargin: 8,  grossMargin: 40, opMargin: 10, deRatio: 0.7, currentRatio: 1.6, beta: 0.9 },
    Materials:   { pe: 15, pb: 2.0, roe: 12, roa: 6,  netMargin: 9,  grossMargin: 30, opMargin: 12, deRatio: 0.6, currentRatio: 1.8, beta: 1.1 },
    Other:       { pe: 18, pb: 2.5, roe: 12, roa: 6,  netMargin: 10, grossMargin: 40, opMargin: 12, deRatio: 0.6, currentRatio: 1.8, beta: 1.0 },
  };
  const d = defaults[sector] || defaults.Other;
  return { ticker, name, sector, industry: sector, ...d, _isFallback: true };
}

// ═══ Helpers ═══
function first(val) { if (!val || val._fmpError) return null; return Array.isArray(val) ? val[0] : val; }
function grow(cur, prev) { if (!cur || !prev) return null; return rnd(((cur - prev) / Math.abs(prev)) * 100, 1); }
async function fmpCall(path, key) {
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable${path}${path.includes('?') ? '&' : '?'}apikey=${key}`);
    if (!r.ok) { if (r.status === 429) return { _fmpError: 'limit' }; return null; }
    const data = await r.json();
    if (typeof data === 'string' && data.includes('not available under your current subscription')) return { _fmpError: 'premium' };
    // Detect JSON-level errors (e.g. {"Error Message": "Limit Reach..."})
    if (data && typeof data === 'object' && !Array.isArray(data) && data['Error Message']) {
      const msg = data['Error Message'].toLowerCase();
      if (msg.includes('limit')) return { _fmpError: 'limit' };
      return { _fmpError: 'error' };
    }
    return data;
  } catch { return null; }
}
function rnd(val, d = 1) { if (val == null || isNaN(val)) return null; return Math.round(val * Math.pow(10, d)) / Math.pow(10, d); }
function resp(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } }); }

// ═══ International market helpers ═══

// Normalize AI-estimated fundamentals: convert decimal-format percentages to actual % numbers
// e.g. Claude sometimes returns roe: 0.14 instead of 14.0
function normalizeIntlFundamentals(d) {
  if (!d) return d;
  const PCT_FIELDS = ['roe', 'roa', 'roic', 'netMargin', 'grossMargin', 'opMargin', 'dividendYield', 'payoutRatio', 'fcfYield'];
  // Sanity caps: values above these are clearly wrong for that field
  const SANITY_MAX = { roa: 30, roic: 60, roe: 80, netMargin: 80, grossMargin: 100, opMargin: 80, dividendYield: 30, payoutRatio: 150, fcfYield: 50 };
  const out = { ...d };
  for (const f of PCT_FIELDS) {
    const v = out[f];
    if (v == null) continue;
    // Only convert clearly decimal values (< 0.5) — e.g. 0.14 → 14
    // Values 0.5–2 are ambiguous; leave as-is and rely on prompt compliance
    if (Math.abs(v) < 0.5 && v !== 0) {
      out[f] = rnd(v * 100, 2);
    }
    // Sanity clamp: if still out of realistic range, set null
    const cap = SANITY_MAX[f];
    if (cap != null && out[f] != null && Math.abs(out[f]) > cap) {
      out[f] = null;
    }
  }
  return out;
}

function isIntlTicker(ticker) { return /\.(BK|HK)$/i.test(ticker); }
function getMarketInfo(ticker) {
  if (/\.BK$/i.test(ticker)) return { market: 'SET', currency: 'THB', flag: '🇹🇭', currencySymbol: '฿' };
  if (/\.HK$/i.test(ticker)) return { market: 'HKEX', currency: 'HKD', flag: '🇭🇰', currencySymbol: 'HK$' };
  return { market: 'US', currency: 'USD', flag: '🇺🇸', currencySymbol: '$' };
}

// Deterministic picks: 2 US + 2 SET + 1 HK top movers, used when Claude is unavailable.
function buildPicksFallback(usTop, setTop, hkTop) {
  const toPick = (q) => {
    const up = (q.changePercent || 0) >= 0;
    return {
      ticker: q.ticker,
      name: q.name,
      price: q.price,
      changePercent: q.changePercent,
      sector: '',
      market: q.market,
      flag: q.flag,
      currencySymbol: q.currencySymbol,
      risk: 'balanced',
      riskLevel: 2,
      reason: up ? 'Top mover today in its market' : 'Notable mover today in its market',
      emoji: '📈',
    };
  };
  const out = [];
  if (usTop[0])  out.push(toPick(usTop[0]));
  if (usTop[1])  out.push(toPick(usTop[1]));
  if (setTop[0]) out.push(toPick(setTop[0]));
  if (setTop[1]) out.push(toPick(setTop[1]));
  if (hkTop[0])  out.push(toPick(hkTop[0]));
  return out;
}

// ═══ Yahoo Finance v8 chart API (no crumb needed) ═══
async function fetchFromYahoo(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    if (!r.ok) return null;
    const json = await r.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;

    const marketInfo = getMarketInfo(ticker);
    const prevClose = meta.chartPreviousClose || meta.regularMarketPrice;
    const change = meta.regularMarketPrice - prevClose;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;

    return {
      ticker: ticker.toUpperCase(),
      name: meta.longName || meta.shortName || ticker,
      exchange: meta.exchangeName || marketInfo.market,
      currency: meta.currency || marketInfo.currency,
      market: marketInfo.market,
      flag: marketInfo.flag,
      currencySymbol: marketInfo.currencySymbol,
      price: meta.regularMarketPrice,
      change: rnd(change, 2),
      changePercent: rnd(changePercent, 2),
      volume: meta.regularMarketVolume,
      high52: meta.fiftyTwoWeekHigh ?? meta.regularMarketDayHigh ?? null,
      low52: meta.fiftyTwoWeekLow ?? meta.regularMarketDayLow ?? null,
      _source: 'yahoo',
    };
  } catch { return null; }
}
