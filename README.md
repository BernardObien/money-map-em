# Money Map · EM Extension

An open extension of the [MIT DCI Money Map](https://mit-dci.github.io/payments-dashboard/) for emerging-market corridors, methods, and rails where operator-side ground truth changes the picture.

**Live prototype:** https://bernardobien.github.io/money-map-em/

## v0.3 changelog

Full redesign following external design feedback. The reviewer built a wireframe prototype of the target UX; their proposed flow forms the basis of this version.

- **Primary user flow — route → amount → currency → results.** Route is a sender/recipient dropdown pair; amount is a free-text field with quick-select presets ($1 / $10 / $100 / $1k / $10k); send/receive currency toggles (fiat or crypto) filter the method set. The intent is that the user always knows what to do next.
- **Immediate result header** — "You send $X → they receive ₦Y" at mid-market, with the effective rate and a parallel-market info note for NGN/ARS.
- **Per-method fee breakdown** — every row expands to Fee breakdown (send / FX spread / network / receive / total), FX rate used vs mid-market with source and timestamp, and a range disclosure. List and card views, sortable by cheapest or fastest, filterable by speed / send method / receive method. US→Nigeria is decomposed to match the reviewer's wireframe exactly.
- **Methodology corrections carried forward** — NGN off-ramp at retail rates, Coinbase card-fee split (USDC ~2.44% vs USDT ~4.19%), and a guard so a recipient can never receive more than the mid-market value of what was sent. FX spread / send / receive fees scale with amount; network and flat wire fees do not.
- **Deferred, per the reviewer** — map visualisation and cost-spectrum chart are intentionally not built yet, to be added later behind a control. Gas Fees and Stablecoin Use are stubbed as coming-soon tabs.

Credit: design feedback and wireframe from an external reviewer. Their proposed flow is the basis of v0.3.

## v0.2 changelog

Revised after a round of feedback from an early external reviewer. Changes:

- **Methodology corrections.** Card on-ramp fees are now differentiated by asset (USDC ~2.44% vs USDT ~4.19%, per Coinbase's published schedule) rather than treated as uniform. NGN bank off-ramp is modeled at retail rates (~0.1–0.5%), correcting an earlier assumption that was an order of magnitude too high and made stablecoin rails look worse than they are.
- **Per-method fee breakdown.** Every stablecoin route now decomposes its total into on-ramp / network fee / off-ramp / FX spread — click any row to expand it. FX spread is always applied as a cost, and a guard ensures a recipient can never receive more than the amount sent.
- **UX simplification.** Cut to a two-colour palette (neutral ink + a single blue accent), replaced the green "best" highlight with a ★ marker, collapsed the methodology note into an expandable section, added a "How to read this" opener and a legend, and turned the corridor tabs into single-line pills. Renamed the "Not on Money Map" tag to "Missing from DCI".

## Why this exists

The DCI Money Map is genuinely useful, but at the time of writing (August 2026) it has three structural gaps for emerging-market analysis:

1. **US-originating corridors only** — no UK→Nigeria, no US→Kenya, no intra-EM flows, no Africa or MENA beyond Nigeria.
2. **Missing EM-native methods** — LemFi, Sendwave, NALA, Grey, ChipperCash, Yellow Card, Bitso, Binance P2P, mobile-money direct routes, and USDT-on-Tron off-ramps are absent from the corridors that are covered.
3. **Data availability rendered as $0.00 / 0.00%** — the "best fee" for Nigeria, India, Philippines, and Indonesia shows as zero, which reads as costless transfer rather than "data unavailable."

This prototype adds four corridors (US→Nigeria, US→Kenya, UK→Nigeria, US→Argentina) with 6–15 methods each including the missing categories, and makes parallel-market FX benchmarks explicit for corridors where the gap materially changes the "best rate" calculation (Nigeria ~4.6%, Argentina ~10.7%).

## What's here

- `index.html` — the dashboard UI
- `app.js` — client-side rendering, filtering, corridor switching
- `data.json` — corridor + method + FX data (structured for daily updates)

No build step, no framework, no backend. Fork, edit `data.json`, push to GitHub Pages.

## Data

Rates are August 2026 approximations from published provider fee schedules, off-ramp spreads observed in live corridors, and Cambio corridor observations. Every method carries an `on_money_map` boolean indicating whether the DCI Money Map covers it today. FX benchmarks use parallel-market rates where a meaningful gap exists.

**These are not live quotes.** See the roadmap below for planned live-API integration.

## Roadmap

The obvious next steps, in order of effort:

- **[Low effort]** Daily rate updates via a scheduled GitHub Action pulling from provider public APIs (Wise, Remitly public quote endpoints, Coinbase off-ramp published rates, Bitso and Yellow Card public FX feeds).
- **[Medium effort]** Parallel-market FX oracle: automated ingestion from Aboki FX (NGN), the blue-dollar market (ARS), Ghana forex bureaux, and other EM parallel-rate sources with a documented methodology page.
- **[Medium effort]** Corridor coverage expansion: US→Ghana, US→Egypt, US→Vietnam, Canada→India, Australia→Philippines, and the intra-EM corridors (Nigeria→Ghana, Kenya→Uganda, South Africa→Zimbabwe) where stablecoin rails have their strongest use case.
- **[Higher effort]** Historical time-series view — how rates moved during the March 2023 USDC/SVB stress window, the October 2025 crypto liquidation event, and other stress moments.
- **[Higher effort]** Realized-off-ramp-spread telemetry from operators willing to contribute anonymized transaction data — a genuine "what did the household actually receive" view, not just quoted fees.

The last two are natural collaboration territory with the MIT DCI Payments Dashboard project.

## Contributing

Corrections, additional methods, corridor requests, or off-ramp spread observations: open an issue, PR, or email obien@mit.edu.

## Attribution

Built by Bernard O'bien / [Cambio](https://whoisbob.co). Extends the MIT DCI Money Map (mit-dci.github.io/payments-dashboard). Not affiliated with MIT DCI.
