# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/RahmaMaria/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/RahmaMaria/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — a web dashboard that ranks DeFiLlama-tracked protocols that still record
no token by what their launch would be worth, with a detail view and a farm plan for
each one. Built for make.fun's “Build the best token launch radar” bounty.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes the ranked
board to `out/board.json`, the dashboard's data to `out/data.js`, copies `dashboard/` and
`screenshots/` to `out/`, and writes `out/dossier.json`. Open `out/dashboard/index.html`
in a browser — the page is static and makes no network requests.

## What it ranks

A protocol is ranked when DefiLlama records no token for it (no market cap, no CoinGecko
id, no symbol) and it is not a wrapped, staked or bridged product of a token that already
trades: no CEX, Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking or Restaked BTC
category, no whole word “wrapped”, “staked” or “staking” in its name, no exchange-prefixed
name, no versioned name such as “Foo V2”. On the sealed snapshot (758 protocols, 2026-11-14)
that is **198 protocols**: the full 40-protocol watchlist plus 158 more, including 138 below
the $50M watchlist floor. Every row traces to the snapshot; nothing is invented.

## The value model (radar-2)

```
implied = TVL × category multiple × growth × maturity × chain reach
```

- **Category multiple** — the median circulating market-cap per dollar of TVL among the
  live-token protocols in the same category (at least 3 comparables, else the global
  median 0.214), clamped to 0.05–0.60 so one outlier category cannot dominate. Recomputed
  from the snapshot on every run; e.g. Dexs 0.342, RWA 0.275, Yield 0.191, CDP 0.169,
  Yield Aggregator 0.151, Indexes 0.148, Lending 0.132.
- **Growth** — 1 + clamp(7-day TVL change, −60%, +120%) ÷ 100 × 0.5.
- **Maturity** — 0.6 + min(age in days, 1095) ÷ 1095 × 0.4 (unknown listing date: 365 days).
- **Chain reach** — 1 + min(chains − 1, 4) × 0.03.

No protocol name is special-cased: the same function scores every row. Implied values are
model estimates from the snapshot's own figures, never a prediction that a token will
launch or what it would trade at. “Records no token” means the record lists none; a
protocol may still have a token its record does not carry.

## The dashboard

- **Board** — all 198 protocols, sortable, with search, category and chain filters, a
  watchlist-only toggle, and an implied-value bar per row.
- **Detail view** — click any row: facts, the full model breakdown (TVL × multiples =
  implied value), the six-step farm plan, live comparables in the same category, and the
  caveats.
- **Already trading** — the 24 largest live-token protocols by market cap, the comparables
  the model learns from, kept apart from the ranked board.
- **Method & sandbox** — the formula, the eligibility rules, the category-multiples table,
  and sliders that re-score the board live in the browser (a what-if; the submitted board
  keeps the published constants).

Each farm plan is generated from the protocol's own record (category, main chain, TVL,
age): six concrete steps with a cost and a time each. It is a positioning checklist, not
financial advice, and it never promises a token.

---

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
