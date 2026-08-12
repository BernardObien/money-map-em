# Deployment guide — Money Map EM Extension

## What you have
Four files that make a complete, deployable GitHub Pages site:
- `index.html` — dashboard UI
- `app.js` — client-side rendering
- `data.json` — corridor data (edit this to update rates)
- `README.md` — public-facing project description with roadmap

No build step. No dependencies. Just static files.

## Deploy in 10 minutes

### Step 1 — Create the GitHub repo
1. Go to github.com/new
2. Name it `money-map-em` (or whatever you prefer)
3. Public, no README (you have your own)
4. Create

### Step 2 — Push the files
From your terminal, in the folder containing the four files:
```bash
git init
git add .
git commit -m "Initial commit: EM extension prototype v0.1"
git branch -M main
git remote add origin git@github.com:YOUR_USERNAME/money-map-em.git
git push -u origin main
```

### Step 3 — Enable GitHub Pages
1. Repo → Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: **main**, folder: **/ (root)**
4. Save

Wait 30–60 seconds. Site will be live at:
`https://YOUR_USERNAME.github.io/money-map-em/`

### Step 4 — Update the README and HTML with your actual URLs
Search for `bernardobien` in `index.html` and `README.md` and replace with your GitHub username. Push again.

### Step 5 — Verify the FX numbers
Before sending to Narula, sanity-check the FX benchmarks in `data.json` against current parallel-market rates:
- NGN parallel: check aboki.fx or nairaland
- ARS blue-dollar: check dolarhoy.com or ambito.com
- KES/GHS: check the CBK and BOG official sites

If any are stale, update `data.json` and push.

## Updating rates daily

Edit `data.json`. Every method has `fee_usd` and `fee_pct` — change these. Every corridor has `fx_benchmarks` at the top of the JSON. Commit and push. GitHub Pages auto-redeploys in ~30 seconds.

For a "last updated" timestamp on the site, edit `meta.last_updated` at the top of `data.json`.

## Adding a new corridor

Copy any corridor block in `data.json`, change the `id`, `sender`, `receiver`, `receiver_name`, flags, methods, and add an `fx_benchmarks` entry if needed. The UI picks it up automatically.

## Adding new methods to an existing corridor

Add a new entry to the `methods` array in that corridor's block:
```json
{
  "category": "stablecoin",
  "provider": "USDe on Base",
  "product": "Some route",
  "route": "Description of the flow",
  "time": "20–40 min",
  "fee_usd": 2.50,
  "fee_pct": 1.25,
  "on_money_map": false
}
```

Categories: `bank`, `remittance`, `stablecoin`, `p2p`.

## Roadmap notes (already in README)

The README calls out five roadmap items. Two of them — historical time-series and realized-off-ramp-spread telemetry — are explicitly framed as "natural collaboration territory with the MIT DCI Payments Dashboard project." That's the collaboration hook. Don't remove it.

## What to share with Narula and Ashley

Once deployed, share three things in one message:
1. The live URL
2. A one-line summary: "extended the Money Map framework to four EM corridors including corridors and methods the current dashboard doesn't cover — mostly to help me think through the Sept 9 framing"
3. An offer: "happy to keep extending this, or contribute data upstream if that's useful downstream"

Do NOT frame it as fixing bugs in their tool. Frame it as your own thinking, made public. The gap in their coverage is visible from the site itself — you don't need to point it out in prose.
