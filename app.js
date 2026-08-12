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

  const state = {
    corridorId: data.corridors[0].id,
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
    const recipient = state.amount - displayFee;
    return {
      fee_usd: displayFee,
      fee_pct: method.fee_pct,
      recipient: recipient
    };
  }

  function renderCorridorTabs() {
    const nav = document.getElementById('corridor-tabs');
    nav.innerHTML = '';
    data.corridors.forEach(c => {
      const tab = document.createElement('div');
      tab.className = 'corridor-tab' + (c.id === state.corridorId ? ' active' : '');
      tab.innerHTML =
        '<div><span class="corridor-flag">' + c.flag_sender + ' → ' + c.flag_receiver + '</span></div>' +
        '<div class="corridor-name">' + c.sender + ' → ' + c.receiver_name + '</div>' +
        '<div class="corridor-vol">' + c.annual_volume_note + '</div>';
      tab.onclick = () => { state.corridorId = c.id; renderAll(); };
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
      '<div class="metric"><div class="metric-label">Methods</div><div class="metric-value">' + methods.length + '</div><div class="metric-sub">' + notOnMap + ' not on DCI Money Map</div></div>' +
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
      { id: 'gap', label: 'Not on Money Map' }
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
            (notOnMap > 0 ? ' · ' + notOnMap + ' not on DCI Money Map' : '') +
          '</span>' +
        '</div>';
      items.forEach(m => {
        const isBest = Math.abs(m.fee_usd - bestFee) < 0.01;
        const row = document.createElement('div');
        row.className = 'method' + (isBest ? ' best' : '') + (!m.on_money_map ? ' gap' : '');
        let providerHtml = '<div style="min-width: 0;"><div class="method-provider"><span class="method-provider-text">' + m.provider + ' · ' + m.product + '</span>';
        if (isBest) providerHtml += '<span class="tag tag-best">★ Best</span>';
        if (!m.on_money_map) providerHtml += '<span class="tag tag-gap">Not on Money Map</span>';
        providerHtml += '</div><div class="method-route">' + m.route + '</div></div>';

        row.innerHTML =
          providerHtml +
          '<span class="method-time">' + m.time + '</span>' +
          '<span class="method-fee">$' + m.fee_usd.toFixed(2) + '</span>' +
          '<span class="method-pct">' + m.fee_pct.toFixed(2) + '%</span>' +
          '<span class="method-recipient">$' + m.recipient.toFixed(2) + '</span>' +
          (m.note ? '<div class="method-note">' + m.note + '</div>' : '');
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
