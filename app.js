(async function () {
  let data;
  try {
    data = await (await fetch('data.json')).json();
  } catch (e) {
    document.getElementById('results').innerHTML =
      '<div class="empty">Could not load data.json. If viewing locally, serve via a local HTTP server.</div>';
    return;
  }

  // ---- constants ----------------------------------------------------------
  const SYM = { USD: '$', GBP: '£', CAD: '$', NGN: '₦', KES: 'KSh ', ARS: '$', MXN: '$', INR: '₹', PHP: '₱', BRL: 'R$', TRY: '₺' };
  const SPEED_LABEL = { instant: 'Instant', same_day: 'Same day', lt_3_days: '<3 days' };
  const SPEED_RANK = { instant: 0, same_day: 1, lt_3_days: 2 };
  const BADGE_LABEL = { crypto: 'Crypto', wallet: 'Wallet', bank: 'Bank' };
  const SEND_FILTERS = [['all', 'All methods'], ['bank_ach', 'Bank/ACH'], ['debit_card', 'Debit card'], ['credit_card', 'Credit card'], ['digital_wallet', 'Digital wallet'], ['crypto', 'Crypto']];
  const RECV_FILTERS = [['all', 'All methods'], ['bank_deposit', 'Bank deposit'], ['wallet', 'Digital wallet'], ['crypto', 'Crypto'], ['other', 'Other']];
  const SPEED_FILTERS = [['any', 'Any'], ['instant', 'Instant'], ['same_day', 'Same day'], ['lt_3_days', '<3 days']];
  const PRESETS = [[1, '$1'], [10, '$10'], [100, '$100'], [1000, '$1k'], [10000, '$10k']];

  // ---- state --------------------------------------------------------------
  const first = data.corridors[0];
  const state = {
    sender: first.sender,
    recipient: first.recipient,
    amount: 100,
    sendAs: 'usd',      // 'usd' | 'crypto'
    receiveAs: 'local', // 'local' | 'crypto'
    tab: 'corridors',   // 'corridors' | 'dci'
    speed: 'any',
    send: 'all',
    receive: 'all',
    view: 'list',       // 'list' | 'cards'
    sort: 'cheapest',   // 'cheapest' | 'fastest'
    expanded: {}        // method name -> bool
  };

  // ---- helpers ------------------------------------------------------------
  const corridor = () => data.corridors.find(c => c.sender === state.sender && c.recipient === state.recipient);
  const senders = () => data.corridors.map(c => c.sender).filter((v, i, a) => a.indexOf(v) === i);
  const recipientsFor = s => data.corridors.filter(c => c.sender === s);
  const mid = () => data.fx_rates[corridor().fx_pair].mid;
  const usd = n => '$' + n.toFixed(2);
  const senderMoney = n => SYM[corridor().sender_currency] + n.toFixed(2);
  const recvLocal = n => SYM[corridor().recipient_currency] + Math.round(n).toLocaleString();

  function compute(m) {
    const amt = state.amount, b = m.fee_breakdown, M = mid();
    const send = b.send_fee_pct / 100 * amt + b.send_fee_flat_usd;
    const fx = b.fx_spread_pct / 100 * amt;
    const network = b.network_fee_usd;
    const receive = b.receive_fee_pct / 100 * amt;
    const total = send + fx + network + receive;
    const vs = amt > 0 ? total / amt * 100 : 0;
    const fxRateUsed = M * (1 - b.fx_spread_pct / 100);
    let recvUsd = amt - total;
    let recvLocalAmt = recvUsd * M;
    // Guard: a recipient can never receive more than the mid-market value of what
    // was sent. Every fee is a subtraction, never a credit.
    if (recvLocalAmt > amt * M) { console.error('recipient exceeds sent for', m.name); recvLocalAmt = amt * M * 0.999; recvUsd = amt * 0.999; }
    return { send, fx, network, receive, total, vs, fxRateUsed, recvUsd, recvLocalAmt };
  }

  function baseMethods() {
    // currency toggles: if either side is crypto, only crypto-native methods
    const cryptoOnly = state.sendAs === 'crypto' || state.receiveAs === 'crypto';
    return corridor().methods.filter(m => !cryptoOnly || m.badge === 'crypto');
  }

  function matchesReceive(m) {
    if (state.receive === 'all') return true;
    if (state.receive === 'wallet') return m.receive_method === 'digital_wallet' || m.receive_method === 'mobile_wallet';
    if (state.receive === 'other') return m.receive_method === 'cash_pickup' || m.receive_method === 'other';
    return m.receive_method === state.receive;
  }

  function filtered() {
    let list = baseMethods().filter(m =>
      (state.speed === 'any' || m.speed_tier === state.speed) &&
      (state.send === 'all' || m.send_method === state.send) &&
      matchesReceive(m)
    );
    list = list.map(m => ({ m, c: compute(m) }));
    if (state.sort === 'fastest') list.sort((a, b) => (SPEED_RANK[a.m.speed_tier] - SPEED_RANK[b.m.speed_tier]) || (a.c.total - b.c.total));
    else list.sort((a, b) => a.c.total - b.c.total);
    // cheapest tag: single lowest total among the filtered set
    if (list.length) {
      const min = Math.min(...list.map(x => x.c.total));
      let tagged = false;
      list.forEach(x => { x.cheapest = !tagged && Math.abs(x.c.total - min) < 1e-9; if (x.cheapest) tagged = true; });
    }
    return list;
  }

  const activeFilterCount = () =>
    (state.speed !== 'any' ? 1 : 0) + (state.send !== 'all' ? 1 : 0) + (state.receive !== 'all' ? 1 : 0);

  // ---- static controls (built once) --------------------------------------
  function buildControls() {
    // route
    const sp = document.getElementById('sender-pick');
    sp.innerHTML = senders().map(s => {
      const c = data.corridors.find(x => x.sender === s);
      return `<option value="${s}" ${s === state.sender ? 'selected' : ''}>${c.sender_flag} ${c.sender_name}</option>`;
    }).join('');
    sp.onchange = () => {
      state.sender = sp.value;
      const rs = recipientsFor(state.sender);
      state.recipient = rs[0].recipient;
      buildRecipient();
      resetOnRouteChange();
    };
    buildRecipient();

    // presets
    document.getElementById('presets').innerHTML = PRESETS.map(([v, l]) =>
      `<button class="preset" data-v="${v}">${l}</button>`).join('');
    document.querySelectorAll('.preset').forEach(btn => btn.onclick = () => {
      state.amount = Number(btn.dataset.v);
      document.getElementById('amount-input').value = state.amount.toFixed(2);
      renderAll();
    });

    // amount input
    const ai = document.getElementById('amount-input');
    ai.oninput = () => {
      const cleaned = ai.value.replace(/[^\d.]/g, '');
      const n = parseFloat(cleaned);
      state.amount = isNaN(n) ? 0 : n;
      renderAll();
    };

    // send/receive-as toggles
    buildToggles();

    // speed chips
    document.getElementById('speed-chips').innerHTML = SPEED_FILTERS.map(([v, l]) =>
      `<button class="chip" data-v="${v}">${l}</button>`).join('');
    document.querySelectorAll('#speed-chips .chip').forEach(ch => ch.onclick = () => { state.speed = ch.dataset.v; renderAll(); });

    // send/receive filter selects
    const sf = document.getElementById('send-filter');
    sf.innerHTML = SEND_FILTERS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    sf.onchange = () => { state.send = sf.value; renderAll(); };
    const rf = document.getElementById('receive-filter');
    rf.innerHTML = RECV_FILTERS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    rf.onchange = () => { state.receive = rf.value; renderAll(); };

    // sort + view + clear
    document.getElementById('sort-pick').onchange = e => { state.sort = e.target.value; renderAll(); };
    document.getElementById('view-toggle').innerHTML =
      `<button data-v="list">List</button><button data-v="cards">Cards</button>`;
    document.querySelectorAll('#view-toggle button').forEach(b => b.onclick = () => { state.view = b.dataset.v; renderAll(); });
    document.getElementById('clear-filters').onclick = () => {
      state.speed = 'any'; state.send = 'all'; state.receive = 'all';
      document.getElementById('send-filter').value = 'all';
      document.getElementById('receive-filter').value = 'all';
      renderAll();
    };

    // nav tabs (Corridors / vs DCI)
    document.querySelectorAll('.navtab[data-tab]').forEach(t => t.onclick = () => { state.tab = t.dataset.tab; renderAll(); });

    // topbar meta + footer
    document.getElementById('topbar-meta').innerHTML =
      `Rates as of ${data.meta.rate_timestamp}<br>${data.meta.fx_source}`;
    document.getElementById('footer').innerHTML =
      `Rates from ${data.meta.fx_source}, ${data.meta.last_updated}. Estimates for the entered amount; costs shift with amount. FX spread, send and receive fees scale; network and flat wire fees do not. Not live quotes. ` +
      `Built by <a href="https://whoisbob.co" target="_blank" rel="noopener">Bernard O'bien</a> · Cambio · extends the <a href="https://mit-dci.github.io/payments-dashboard/" target="_blank" rel="noopener">MIT DCI Money Map</a>. ` +
      `<a href="https://github.com/BernardObien/money-map-em" target="_blank" rel="noopener">Source</a>.`;
  }

  function buildRecipient() {
    const rp = document.getElementById('recipient-pick');
    rp.innerHTML = recipientsFor(state.sender).map(c =>
      `<option value="${c.recipient}" ${c.recipient === state.recipient ? 'selected' : ''}>${c.recipient_flag} ${c.recipient_name}</option>`).join('');
    rp.onchange = () => { state.recipient = rp.value; resetOnRouteChange(); };
  }

  function buildToggles() {
    const c = corridor();
    document.getElementById('amount-cur').textContent = SYM[c.sender_currency];
    document.getElementById('sendas-seg').innerHTML =
      `<button data-v="usd">${c.sender_currency}</button><button data-v="crypto">Crypto</button>`;
    document.getElementById('receiveas-seg').innerHTML =
      `<button data-v="local">${c.recipient_currency}</button><button data-v="crypto">Crypto</button>`;
    document.querySelectorAll('#sendas-seg button').forEach(b => b.onclick = () => { state.sendAs = b.dataset.v; renderAll(); });
    document.querySelectorAll('#receiveas-seg button').forEach(b => b.onclick = () => { state.receiveAs = b.dataset.v; renderAll(); });
  }

  function resetOnRouteChange() {
    state.sendAs = 'usd'; state.receiveAs = 'local';
    state.speed = 'any'; state.send = 'all'; state.receive = 'all'; state.expanded = {};
    document.getElementById('send-filter').value = 'all';
    document.getElementById('receive-filter').value = 'all';
    buildToggles();
    renderAll();
  }

  // ---- dynamic render -----------------------------------------------------
  function renderAll() {
    // tab switch: Corridors vs the "vs DCI" comparison
    document.querySelectorAll('.navtab[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === state.tab));
    const isDci = state.tab === 'dci';
    document.getElementById('corridors-view').style.display = isDci ? 'none' : '';
    document.getElementById('dci-view').style.display = isDci ? '' : 'none';
    if (isDci) { renderDci(); return; }

    // active classes on controls
    document.querySelectorAll('.preset').forEach(b => b.classList.toggle('active', Number(b.dataset.v) === state.amount));
    document.querySelectorAll('#speed-chips .chip').forEach(ch => ch.classList.toggle('on', ch.dataset.v === state.speed));
    document.querySelectorAll('#sendas-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === state.sendAs));
    document.querySelectorAll('#receiveas-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === state.receiveAs));
    document.querySelectorAll('#view-toggle button').forEach(b => b.classList.toggle('on', b.dataset.v === state.view));
    document.getElementById('send-filter').classList.toggle('on', state.send !== 'all');
    document.getElementById('receive-filter').classList.toggle('on', state.receive !== 'all');
    const fc = activeFilterCount();
    document.getElementById('filter-count').textContent = fc ? `${fc} filter${fc > 1 ? 's' : ''}` : '';

    renderHero();
    renderSpectrum();
    renderResults();
  }

  // Cost spectrum — one dot per method, positioned by total cost (best value →
  // expensive). Colour carries the thesis: red = added by this extension
  // (missing from DCI), ink = already on DCI. Square-root x so the cheap cluster
  // stays legible while bank wires sit out at the expensive end.
  function renderSpectrum() {
    const el = document.getElementById('spectrum');
    const list = baseMethods().map(m => ({ m, c: compute(m) }));
    if (list.length < 2) { el.innerHTML = ''; return; }
    const pctOf = x => (state.amount > 0 ? x.c.total / state.amount * 100 : 0);
    const maxPct = Math.max(...list.map(pctOf), 0.5);
    const sq = v => Math.sqrt(Math.max(v, 0) / maxPct);
    const W = 1000, padL = 16, padR = 16, y = 52, trackW = W - padL - padR;
    const sorted = [...list].sort((a, b) => a.c.total - b.c.total);
    const cheapest = sorted[0], priciest = sorted[sorted.length - 1];
    const dots = list.map(x => {
      const cx = padL + sq(pctOf(x)) * trackW, missing = !x.m.on_money_map, isCh = x === cheapest;
      return `<circle cx="${cx.toFixed(1)}" cy="${y}" r="${isCh ? 7 : 5}" fill="${missing ? 'var(--red)' : 'var(--ink-3)'}" fill-opacity="${missing ? 1 : 0.5}" stroke="#fff" stroke-width="1.5"><title>${x.m.name} · ${pctOf(x).toFixed(2)}%</title></circle>`;
    }).join('');
    const lbl = (x, anchor, dx) => {
      const cx = padL + sq(pctOf(x)) * trackW;
      return `<text x="${(cx + dx).toFixed(1)}" y="28" text-anchor="${anchor}" class="spec-lbl">${x.m.name}</text>` +
        `<text x="${(cx + dx).toFixed(1)}" y="42" text-anchor="${anchor}" class="spec-lbl-pct">${pctOf(x).toFixed(2)}%</text>`;
    };
    el.innerHTML =
      `<div class="spectrum-head">Cost spectrum · ${list.length} methods<span class="spectrum-sub">position ≈ total cost · cheapest → most expensive</span></div>` +
      `<svg viewBox="0 0 ${W} 92" preserveAspectRatio="none" class="spectrum-svg" role="img" aria-label="Cost spectrum of methods, cheapest to most expensive">` +
        `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--line-2)" stroke-width="1.5"/>` +
        lbl(cheapest, 'start', -4) + lbl(priciest, 'end', 4) +
        dots +
        `<text x="${padL}" y="82" class="spec-axis">Best value</text>` +
        `<text x="${W - padR}" y="82" text-anchor="end" class="spec-axis">Most expensive</text>` +
      `</svg>` +
      `<div class="spectrum-legend"><span><i class="sw sw-red"></i> Added by this extension (missing from DCI)</span><span><i class="sw sw-ink"></i> On DCI</span></div>`;
  }

  function renderHero() {
    const c = corridor(), M = mid(), amt = state.amount;
    const receiveHero = state.receiveAs === 'crypto'
      ? '$' + amt.toFixed(2)
      : recvLocal(amt * M);
    document.getElementById('hero-main').innerHTML =
      `<span style="font-size:11px; font-weight:700; letter-spacing:0.06em; color:var(--ink-3); text-transform:uppercase;">You send</span> ` +
      `<span class="send">${senderMoney(amt)}</span><span class="arrow">→</span>` +
      `<span style="font-size:11px; font-weight:700; letter-spacing:0.06em; color:var(--ink-3); text-transform:uppercase;">They receive</span> ` +
      `<span class="receive">${receiveHero}${state.receiveAs === 'crypto' ? ' <span style="font-size:13px;font-weight:600;color:var(--ink-3)">in stablecoin</span>' : ''}</span>`;

    const bench = data.fx_benchmarks[c.recipient_currency];
    let sub;
    if (state.receiveAs === 'crypto') {
      sub = `crypto out · recipient holds USD-pegged stablecoin. Actual amount received varies by method fee, below.`;
    } else {
      sub = `at mid-market · 1 ${c.sender_currency} = ${SYM[c.recipient_currency]}${M.toLocaleString()}`;
      if (bench) sub += `<span class="infodot">i<span class="tip">${bench.note}</span></span>`;
      sub += `<br>Actual amount received varies by method, below.`;
    }
    document.getElementById('hero-sub').innerHTML = sub;
  }

  function renderResults() {
    const list = filtered();
    const total = baseMethods().length;
    const shown = list.length;
    const fc = activeFilterCount();

    // meta
    document.getElementById('results-count').innerHTML = fc
      ? `${shown} <span style="color:var(--ink-3);font-weight:400">of ${total} methods</span>`
      : `${total} methods available`;
    document.getElementById('results-note').textContent = fc
      ? `${total - shown} hidden by filters`
      : (state.sort === 'cheapest' ? 'Sorted cheapest first · position communicates rank' : 'Sorted fastest first');

    const el = document.getElementById('results');
    if (!shown) { el.innerHTML = '<div class="listwrap"><div class="empty">No methods match these filters.</div></div>'; return; }
    el.innerHTML = state.view === 'cards' ? renderCards(list) : renderList(list);
    wireRows();
  }

  function nameCell(x) {
    let tags = '';
    if (x.cheapest) tags += ' <span class="pill-cheapest">Cheapest</span>';
    if (!x.m.on_money_map) tags += ' <span class="tag-missing" title="Not covered by the current DCI Money Map">Missing from DCI</span>';
    return tags;
  }

  function renderList(list) {
    const head =
      `<div class="list-head"><span>#</span><span>Method</span><span class="r">Total cost</span>` +
      `<span class="r c-vs">vs mid-market</span><span class="r c-speed">Speed</span><span class="r">They receive</span><span></span></div>`;
    const rows = list.map((x, i) => {
      const c = x.c, m = x.m;
      const incl = m.fee_breakdown.network_fee_usd > 0 ? `<span class="m-incl">incl. ${usd(m.fee_breakdown.network_fee_usd)} network</span>` : '';
      const recv = state.receiveAs === 'crypto' ? usd(c.recvUsd) : recvLocal(c.recvLocalAmt);
      const open = state.expanded[m.name];
      return `<div class="row" data-name="${m.name}">` +
        `<span class="row-num">${i + 1}</span>` +
        `<div class="row-method"><div class="m-name">${m.name}${nameCell(x)}</div><div class="m-sub">${m.subtitle}</div></div>` +
        `<div class="m-total">${usd(c.total)}${incl}</div>` +
        `<div class="m-vs c-vs">${c.vs.toFixed(2)}%</div>` +
        `<div class="m-speed c-speed">${SPEED_LABEL[m.speed_tier]}<span class="detail">${m.speed_detail}</span></div>` +
        `<div class="m-receive">${recv}</div>` +
        `<div class="caret">${open ? '▲' : '▾'}</div>` +
        (open ? breakdownPanel(x) : '') +
        `</div>`;
    }).join('');
    return `<div class="listwrap">${head}${rows}</div>`;
  }

  function breakdownPanel(x) {
    const c = x.c, m = x.m, cor = corridor();
    const cryptoOut = state.receiveAs === 'crypto';
    const rateCol = cryptoOut
      ? `<div class="bd-col"><div class="bd-title">FX rate used</div><div class="bd-rate">crypto out</div><div class="bd-meta">Recipient holds USD-pegged stablecoin — no local-currency conversion applied.</div></div>`
      : `<div class="bd-col"><div class="bd-title">FX rate used</div><div class="bd-rate">1 ${cor.sender_currency} = ${SYM[cor.recipient_currency]}${c.fxRateUsed.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>` +
        `<div class="bd-meta">Mid-market ${SYM[cor.recipient_currency]}${mid().toLocaleString()} · spread ${m.fee_breakdown.fx_spread_pct.toFixed(2)}%<br>${data.meta.fx_source} · ${data.meta.rate_timestamp}</div></div>`;
    return `<div class="breakdown">` +
      `<div class="bd-col"><div class="bd-title">Fee breakdown</div>` +
        line('Send fee', usd(c.send)) +
        line('FX spread (' + m.fee_breakdown.fx_spread_pct.toFixed(2) + '%)', usd(c.fx)) +
        (c.network > 0 ? line('Network fee', usd(c.network)) : line('Network fee', '—')) +
        line('Receive / cash-out fee', usd(c.receive)) +
        `<div class="bd-line total"><span>Total cost</span><span class="v">${usd(c.total)}</span></div></div>` +
      rateCol +
      `<div class="bd-col"><div class="bd-title">Range disclosure</div><div class="bd-range">${usd(m.range_low)} – ${usd(m.range_high)}</div>` +
        `<div class="bd-meta">${m.breakdown_note || 'Estimate range for this method at the current amount.'}<br>Send: ${labelSend(m.send_method)} · Receive: ${labelRecv(m.receive_method)}</div></div>` +
      `</div>`;
  }
  const line = (l, v) => `<div class="bd-line"><span>${l}</span><span class="v">${v}</span></div>`;
  const labelSend = v => ({ bank_ach: 'Bank/ACH', debit_card: 'Debit card', credit_card: 'Credit card', digital_wallet: 'Digital wallet', crypto: 'Crypto wallet' }[v] || v);
  const labelRecv = v => ({ bank_deposit: 'Bank deposit', digital_wallet: 'Digital wallet', mobile_wallet: 'Mobile wallet', cash_pickup: 'Cash pickup', crypto: 'Crypto wallet', other: 'Other' }[v] || v);

  function renderCards(list) {
    const cards = list.map(x => {
      const c = x.c, m = x.m;
      const recv = state.receiveAs === 'crypto' ? usd(c.recvUsd) : recvLocal(c.recvLocalAmt);
      return `<div class="mcard" data-name="${m.name}">` +
        `<div class="mcard-badge"><span class="badge-type">${BADGE_LABEL[m.badge]}</span>${x.cheapest ? '<span class="pill-cheapest">Cheapest</span>' : (!m.on_money_map ? '<span class="tag-missing">Missing from DCI</span>' : '')}</div>` +
        `<div class="mcard-name">${m.name}</div>` +
        `<div class="mcard-sub">${m.subtitle}</div>` +
        `<div class="mcard-hero-l">They receive</div><div class="mcard-hero">${recv}</div>` +
        line2('Total cost', usd(c.total)) +
        line2('Send fee', usd(c.send)) +
        line2('FX spread', usd(c.fx)) +
        line2('Network fee', c.network > 0 ? usd(c.network) : '—') +
        line2('Speed', SPEED_LABEL[m.speed_tier]) +
        `<button class="mcard-full" data-full="${m.name}">Full breakdown →</button>` +
        `</div>`;
    }).join('');
    return `<div class="cardgrid">${cards}</div>`;
  }
  const line2 = (l, v) => `<div class="mcard-line"><span>${l}</span><span class="v">${v}</span></div>`;

  function wireRows() {
    if (state.view === 'list') {
      document.querySelectorAll('.row').forEach(r => r.onclick = () => {
        const n = r.dataset.name; state.expanded[n] = !state.expanded[n]; renderResults();
      });
    } else {
      document.querySelectorAll('.mcard-full').forEach(b => b.onclick = () => {
        // switch to list and expand that method
        state.view = 'list'; state.expanded[b.dataset.full] = true; renderAll();
        const row = document.querySelector(`.row[data-name="${CSS.escape(b.dataset.full)}"]`);
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  // ---- "vs DCI" comparison view ------------------------------------------
  function renderDci() {
    const dci = data.dci, study = data.study;
    const total100 = m => { const b = m.fee_breakdown; return b.send_fee_pct + b.fx_spread_pct + b.receive_fee_pct + b.send_fee_flat_usd + b.network_fee_usd; };
    const senderShort = s => ({ US: 'US', GB: 'UK', CA: 'CA' }[s] || s);
    const extLabel = c => `${senderShort(c.sender)} → ${c.recipient_name}`;
    const dciCodeOf = c => `${c.sender}-${c.recipient}`;
    const dciCodes = dci.corridors.map(c => c.code);
    const extBest = code => {
      const rec = code.split('-')[1];
      const cor = data.corridors.find(c => c.sender === 'US' && c.recipient === rec);
      if (!cor) return null;
      let best = Infinity, name = '';
      cor.methods.forEach(m => { const t = total100(m); if (t < best) { best = t; name = m.name; } });
      return { pct: best, name };
    };

    // study thesis
    const why = study.why_points.map(p => `<div class="why-item"><span class="why-c">${p.country}</span> ${p.note}</div>`).join('');

    // coverage matrix
    const extNotes = { 'US-KE': 'M-Pesa corridor DCI omits entirely', 'GB-NG': 'UK origin — DCI is US-only', 'GB-IN': 'UK origin — DCI is US-only', 'CA-IN': 'Canada origin — DCI is US-only' };
    let rows = dci.corridors.map(c => ({ label: c.label, onDci: true, inExt: c.in_extension, note: c.in_extension ? 'Shared — compared below' : 'On DCI · not yet in this extension' }));
    data.corridors.forEach(c => { const code = dciCodeOf(c); if (!dciCodes.includes(code)) rows.push({ label: extLabel(c), onDci: false, inExt: true, note: extNotes[code] || 'Added by this extension' }); });
    const mark = v => v ? '<span class="yes">✓</span>' : '<span class="no">—</span>';
    const covRows = rows.map(r => `<tr><td>${r.label}</td><td class="c">${mark(r.onDci)}</td><td class="c">${mark(r.inExt)}</td><td class="note">${r.note}</td></tr>`).join('');

    // multi-corridor cost comparison
    const costRows = [...dci.corridor_costs].sort((a, b) => (a.dci_pct == null ? 999 : a.dci_pct) - (b.dci_pct == null ? 999 : b.dci_pct)).map(cc => {
      const label = (dci.corridors.find(x => x.code === cc.code) || {}).label || cc.code;
      const dciCell = cc.dci_pct == null ? `<span class="muted">${cc.dci_label}</span>`
        : cc.dci_pct === 0 ? `≈0.00% <span class="muted">${cc.dci_label}</span>`
        : `${cc.dci_pct.toFixed(2)}% <span class="muted">${cc.dci_label}</span>`;
      const eb = extBest(cc.code);
      const extCell = eb ? `<span class="yes">${eb.pct.toFixed(2)}%</span> <span class="muted">${eb.name}</span>` : '<span class="no">—</span>';
      let delta = '';
      if (eb && cc.dci_pct) { const x = cc.dci_pct / eb.pct; if (x >= 1.5) delta = `${x.toFixed(0)}× cheaper`; }
      return `<tr><td>${label}</td><td class="r">${dciCell}</td><td class="r">${extCell}</td><td class="r delta">${delta}</td></tr>`;
    }).join('');

    // shared corridor (US → Nigeria)
    const ng = data.corridors.find(c => c.id === dci.shared_corridor.id);
    const added = ng.methods.filter(m => !m.on_money_map);
    const dciItems = dci.shared_corridor.dci_methods.map(m => `<div class="cmp-item"><span class="nm">${m.name}<span class="cat">${m.category} · ${m.speed}</span></span><span class="val">${m.total_pct.toFixed(2)}%</span></div>`).join('');
    const addItems = added.map(m => `<div class="cmp-item"><span class="nm">${m.name}<span class="cat">${m.subtitle}</span></span><span class="val">${total100(m).toFixed(2)}%</span></div>`).join('');

    const flags = dci.gaps.map(g => `<li>${g}</li>`).join('');

    document.getElementById('dci-view').innerHTML =
      `<div class="dci">` +
        `<div class="study-band"><div class="study-title">${study.title}</div><div class="study-thesis">${study.thesis}</div><div class="study-meta">${study.author} · ${study.period}</div></div>` +
        `<h2>How this extends the ${dci.name}</h2>` +
        `<p class="lede">The <a href="${dci.url}" target="_blank" rel="noopener">MIT DCI Money Map</a> (${dci.as_of}) covers ${dci.corridors.length} US-originating corridors. This prototype keeps the same idea and fills the emerging-market gaps: more sender countries, the last-mile methods DCI omits, and the off-ramp costs its stablecoin model leaves out. The corridor tool is unchanged — switch back with the <strong>Corridors</strong> tab.</p>` +
        `<div class="dci-sec"><div class="dci-sec-h">Why dollar-stable — from the study</div><div class="why-wrap">${why}</div></div>` +
        `<div class="dci-sec"><div class="dci-sec-h">Corridor coverage</div><table class="cov"><thead><tr><th>Corridor</th><th class="c">On DCI</th><th class="c">This extension</th><th>Note</th></tr></thead><tbody>${covRows}</tbody></table></div>` +
        `<div class="dci-sec"><div class="dci-sec-h">Cheapest rail, corridor by corridor</div><div class="dci-sec-sub">DCI's corridor-specific bank baseline vs the cheapest method this extension surfaces (total cost on $100). The stablecoin rail DCI under-models is consistently cheaper.</div><table class="cov cost"><thead><tr><th>Corridor</th><th class="r">DCI baseline</th><th class="r">Extension best</th><th class="r"></th></tr></thead><tbody>${costRows}</tbody></table></div>` +
        `<div class="dci-sec"><div class="dci-sec-h">US → Nigeria · the deepest shared corridor</div><div class="cmp"><div class="cmp-col"><div class="cmp-h">On the DCI Money Map</div><div class="cmp-sub">Nigeria-specific: 3 bank wires + a network-only stablecoin</div>${dciItems}</div><div class="cmp-col"><div class="cmp-h">Added by this extension</div><div class="cmp-sub">${added.length} EM-native methods missing from DCI · total cost on $100</div>${addItems}</div></div></div>` +
        `<div class="dci-sec"><div class="dci-sec-h">Where the DCI numbers mislead</div><ul class="flags">${flags}</ul></div>` +
        `<div class="study-foot">${study.corridor_note}</div>` +
      `</div>`;
  }

  // ---- deep-linking (shareable presets, e.g. ?route=us-ng&view=cards) -----
  function applyParams() {
    const q = new URLSearchParams(location.search);
    const route = q.get('route');
    if (route) {
      const cor = data.corridors.find(c => c.id === route);
      if (cor) {
        state.sender = cor.sender; state.recipient = cor.recipient;
        document.getElementById('sender-pick').value = cor.sender;
        buildRecipient();
        document.getElementById('recipient-pick').value = cor.recipient;
        buildToggles();
      }
    }
    if (q.get('amount')) { const n = parseFloat(q.get('amount')); if (!isNaN(n)) { state.amount = n; document.getElementById('amount-input').value = n.toFixed(2); } }
    if (q.get('view')) state.view = q.get('view');
    if (q.get('sort')) { state.sort = q.get('sort'); document.getElementById('sort-pick').value = state.sort; }
    if (q.get('speed')) state.speed = q.get('speed');
    if (q.get('send')) { state.send = q.get('send'); document.getElementById('send-filter').value = state.send; }
    if (q.get('receive')) { state.receive = q.get('receive'); document.getElementById('receive-filter').value = state.receive; }
    if (q.get('sendAs')) state.sendAs = q.get('sendAs');
    if (q.get('receiveAs')) state.receiveAs = q.get('receiveAs');
    if (q.get('expand')) state.expanded[q.get('expand')] = true;
    if (q.get('tab')) state.tab = q.get('tab');
  }

  // ---- boot ---------------------------------------------------------------
  buildControls();
  applyParams();
  renderAll();
})();
