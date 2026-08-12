(async function () {
  let data;
  try {
    const resp = await fetch('data.json');
    data = await resp.json();
  } catch (e) {
    document.getElementById('methods-list').innerHTML =
      '<div style="padding: 20px; color: #A32D2D;">Could not load data.json. If viewing locally, serve via a local HTTP server.</div>';
    return;
  }

  // Allow deep-linking straight to a corridor, e.g. .../#us-ar — handy for
  // sharing a single corridor in an email.
  const hashCorridor = data.corridors.find(c => c.id === location.hash.replace('#', ''));
  const state = {
    corridorId: hashCorridor ? hashCorridor.id : data.corridors[0].id,
    amount: 200,
    filter: 'all'
  };

  const categoryMeta = {
    bank: { name: 'Traditional banking', order: 4 },
    remittance: { name: 'Remittance services', order: 2 },
    stablecoin: { name: 'Stablecoins', order: 1 },
    p2p: { name: 'P2P / informal', order: 3 }
  };

  document.getElementById('last-updated').textContent = data.meta.last_updated;

  function currentCorridor() {
    return data.corridors.find(c => c.id === state.corridorId);
  }

  function computeMethodValues(method) {
    const feeUsd = (method.fee_pct / 100) * state.amount;
    const displayFee = method.fee_pct >= 0.05
      ? feeUsd
      : (state.amount / 200) * method.fee_usd;
    let recipient = state.amount - displayFee;
    // Guard: the recipient can never receive more than was sent. Every fee —
    // including FX spread — is a cost (subtraction), never a credit. If anything
    // ever pushes the recipient above the send amount, cap it and log the bug.
    if (recipient > state.amount) {
      console.error('Recipient exceeds amount sent for', method.provider, ':', recipient, '>', state.amount);
      recipient = state.amount * 0.999;
    }
    return {
      fee_usd: displayFee,
      fee_pct: method.fee_pct,
      recipient: recipient
    };
  }

  // Decompose a method's total fee into its components for the expandable row.
  // Stablecoin routes carry an explicit fee_breakdown in data.json; everything
  // else is shown as a single provider fee.
  function breakdownRows(m) {
    const amt = state.amount;
    const pctRow = (label, pct) => [label, pct.toFixed(2) + '% · $' + (pct / 100 * amt).toFixed(2)];
    if (m.fee_breakdown) {
      const b = m.fee_breakdown;
      const out = [];
      if (b.onramp_pct != null) out.push(pctRow('On-ramp', b.onramp_pct));
      if (b.network_fee_usd != null) out.push(['Network fee', '$' + b.network_fee_usd.toFixed(2)]);
      if (b.offramp_pct != null) out.push(pctRow('Off-ramp', b.offramp_pct));
      if (b.fx_spread_pct != null) out.push(pctRow('FX spread', b.fx_spread_pct));
      return out;
    }
    return [pctRow('Provider fee', m.fee_pct)];
  }

  function renderCorridorTabs() {
    const nav = document.getElementById('corridor-tabs');
    nav.innerHTML = '';
    data.corridors.forEach(c => {
      const tab = document.createElement('div');
      tab.className = 'corridor-tab' + (c.id === state.corridorId ? ' active' : '');
      tab.title = c.annual_volume_note;
      tab.innerHTML =
        '<span class="corridor-flag">' + c.flag_sender + ' → ' + c.flag_receiver + '</span>' +
        '<span class="corridor-name">' + c.receiver_name + '</span>';
      tab.onclick = () => { state.corridorId = c.id; location.hash = c.id; renderAll(); };
      nav.appendChild(tab);
    });
  }

  function renderCorridorContext() {
    const c = currentCorridor();
    document.getElementById('corridor-context').textContent = c.coverage_note;
  }

  function renderFxPanel() {
    const c = currentCorridor();
    const fx = data.fx_benchmarks[c.receiver === 'NG' ? 'NGN' :
                                   c.receiver === 'KE' ? 'KES' :
                                   c.receiver === 'GH' ? 'GHS' :
                                   c.receiver === 'AR' ? 'ARS' : null];
    if (!fx) { document.getElementById('fx-panel').innerHTML = ''; return; }
    const gap = ((fx.parallel - fx.official) / fx.official * 100).toFixed(2);
    document.getElementById('fx-panel').innerHTML =
      '<div>' +
        '<div class="fx-title">FX benchmark · ' + fx.source + '</div>' +
        '<div class="fx-rates">' +
          '<div class="fx-rate">Official: <strong>' + fx.official.toLocaleString() + '</strong></div>' +
          '<div class="fx-rate">Parallel: <strong>' + fx.parallel.toLocaleString() + '</strong></div>' +
        '</div>' +
      '</div>' +
      (parseFloat(gap) > 0.5
        ? '<div class="fx-gap">Parallel-market gap: ' + gap + '%</div>'
        : '<div class="fx-gap" style="background: #F1EFE8; color: #5F5E5A;">Unified rate</div>');
  }

  function renderAmountChips() {
    const el = document.getElementById('amount-chips');
    el.innerHTML = '';
    [50, 100, 200, 500, 1000, 2000].forEach(a => {
      const chip = document.createElement('button');
      chip.className = 'amount-chip' + (a === state.amount ? ' active' : '');
      chip.textContent = '$' + a.toLocaleString();
      chip.onclick = () => { state.amount = a; renderMetrics(); renderMethods(); };
      el.appendChild(chip);
    });
  }

  function renderMetrics() {
    const c = currentCorridor();
    const methods = c.methods.map(m => Object.assign({}, m, computeMethodValues(m)));
    const sorted = [...methods].sort((a, b) => a.fee_usd - b.fee_usd);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const notOnMap = methods.filter(m => !m.on_money_map).length;
    const savings = worst.fee_usd - best.fee_usd;

    document.getElementById('metrics').innerHTML =
      '<div class="metric"><div class="metric-label">Methods</div><div class="metric-value">' + methods.length + '</div><div class="metric-sub">' + notOnMap + ' missing from DCI</div></div>' +
      '<div class="metric"><div class="metric-label">Best fee</div><div class="metric-value">' + best.fee_pct.toFixed(2) + '%</div><div class="metric-sub">' + best.provider + '</div></div>' +
      '<div class="metric"><div class="metric-label">Worst fee</div><div class="metric-value">' + worst.fee_pct.toFixed(2) + '%</div><div class="metric-sub">' + worst.provider + '</div></div>' +
      '<div class="metric"><div class="metric-label">Max savings</div><div class="metric-value">$' + savings.toFixed(2) + '</div><div class="metric-sub">on $' + state.amount + '</div></div>';
  }

  function renderFilters() {
    const el = document.getElementById('filters');
    el.innerHTML = '';
    const filters = [
      { id: 'all', label: 'All methods' },
      { id: 'bank', label: 'Traditional' },
      { id: 'remittance', label: 'Remittance' },
      { id: 'stablecoin', label: 'Stablecoins' },
      { id: 'p2p', label: 'P2P / informal' },
      { id: 'gap', label: 'Missing from DCI' }
    ];
    filters.forEach(f => {
      const chip = document.createElement('div');
      chip.className = 'filter-chip' + (state.filter === f.id ? ' active' : '');
      chip.textContent = f.label;
      chip.onclick = () => { state.filter = f.id; renderFilters(); renderMethods(); };
      el.appendChild(chip);
    });
  }

  function renderMethods() {
    const c = currentCorridor();
    let methods = c.methods.map(m => Object.assign({}, m, computeMethodValues(m)));

    if (state.filter === 'gap') {
      methods = methods.filter(m => !m.on_money_map);
    } else if (state.filter !== 'all') {
      methods = methods.filter(m => m.category === state.filter);
    }

    const bestFee = Math.min(...c.methods.map(m => computeMethodValues(m).fee_usd));

    const grouped = {};
    methods.forEach(m => {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category].push(m);
    });

    const orderedCats = Object.keys(grouped).sort(
      (a, b) => (categoryMeta[a]?.order || 99) - (categoryMeta[b]?.order || 99)
    );

    const list = document.getElementById('methods-list');
    list.innerHTML = '';

    if (methods.length === 0) {
      list.innerHTML = '<div style="padding: 20px; color: var(--ink-3); text-align: center;">No methods in this filter.</div>';
      return;
    }

    orderedCats.forEach(cat => {
      const items = grouped[cat].sort((a, b) => a.fee_usd - b.fee_usd);
      const catDiv = document.createElement('div');
      catDiv.className = 'category';
      const notOnMap = items.filter(m => !m.on_money_map).length;
      catDiv.innerHTML =
        '<div class="category-header">' +
          '<span class="category-name">' + (categoryMeta[cat]?.name || cat) + '</span>' +
          '<span class="category-meta">' + items.length + ' method' + (items.length === 1 ? '' : 's') +
            (notOnMap > 0 ? ' · ' + notOnMap + ' missing from DCI' : '') +
          '</span>' +
        '</div>';
      items.forEach(m => {
        const isBest = Math.abs(m.fee_usd - bestFee) < 0.01;
        const row = document.createElement('div');
        row.className = 'method' + (isBest ? ' best' : '') + (!m.on_money_map ? ' gap' : '');
        let providerHtml = '<div style="min-width: 0;"><div class="method-provider"><span class="method-provider-text">' + m.provider + ' · ' + m.product + '</span>';
        if (isBest) providerHtml += '<span class="tag tag-best">★ Best</span>';
        if (!m.on_money_map) providerHtml += '<span class="tag tag-gap">Missing from DCI</span>';
        providerHtml += '</div><div class="method-route">' + m.route + ' <span class="method-expand">· fee breakdown ▾</span></div></div>';

        const bd = breakdownRows(m);
        const breakdownHtml =
          '<div class="method-breakdown" hidden>' +
            bd.map(r => '<div class="bd-row"><span class="bd-label">' + r[0] + '</span><span class="bd-val">' + r[1] + '</span></div>').join('') +
            (m.onramp_note ? '<div class="bd-note">' + m.onramp_note + '</div>' : '') +
          '</div>';

        row.innerHTML =
          providerHtml +
          '<span class="method-time">' + m.time + '</span>' +
          '<span class="method-fee">$' + m.fee_usd.toFixed(2) + '</span>' +
          '<span class="method-pct">' + m.fee_pct.toFixed(2) + '%</span>' +
          '<span class="method-recipient">$' + m.recipient.toFixed(2) + '</span>' +
          (m.note ? '<div class="method-note">' + m.note + '</div>' : '') +
          breakdownHtml;

        row.addEventListener('click', () => {
          const panel = row.querySelector('.method-breakdown');
          const caret = row.querySelector('.method-expand');
          if (!panel) return;
          if (panel.hasAttribute('hidden')) {
            panel.removeAttribute('hidden');
            if (caret) caret.textContent = '· fee breakdown ▴';
          } else {
            panel.setAttribute('hidden', '');
            if (caret) caret.textContent = '· fee breakdown ▾';
          }
        });

        catDiv.appendChild(row);
      });
      list.appendChild(catDiv);
    });
  }

  function renderAll() {
    renderCorridorTabs();
    renderCorridorContext();
    renderFxPanel();
    renderAmountChips();
    renderMetrics();
    renderFilters();
    renderMethods();
  }

  renderAll();
})();
