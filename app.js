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
  const SYM = { USD: '$', GBP: '£', NGN: '₦', KES: 'KSh ', ARS: '$' };
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
    renderResults();
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
  }

  // ---- boot ---------------------------------------------------------------
  buildControls();
  applyParams();
  renderAll();
})();
