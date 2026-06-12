# HYPHAE

> *substrate colonization interface*

An incremental idle game. You are a fungal network silently consuming an
abandoned city — threads probing concrete, decomposers digesting rot,
fruiting bodies glowing in the dark. The interface is styled as a
scientific monitoring console: mossy greens, deep grays, faint amber glow.

## Play

Open `index.html` in any modern browser. No build step, no dependencies.

```
# from the repo root
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Mechanics

**Resources**
- **Spores** — primary currency, generated passively by your structures.
- **Biomass** — secondary resource, gated behind decomposition; gates expensive structures and adaptations.
- **Mycosin** — rare permanent multiplier, earned only by Fruiting (prestige). Each point adds +10% to all spore production, forever.

**Growth structures** (unlock in sequence)
Mycelium Thread → Rhizomorph → Decomposer Node → Moisture Tap →
Spore Cloud → Symbiotic Net → Bioluminescent Colony.
Moisture Taps boost thread output, the Symbiotic Net scales with your total
colony size, and the Bioluminescent Colony compounds on itself exponentially.

**Adaptations** (upgrades)
Exponentially-scaling buys in spores and/or biomass — Thicker Cell Walls,
Enzymatic Boost, Root Mimicry, Airborne Adaptation, Mycelial Lattice, and
several colony-wide multipliers. The right panel keeps them sorted by cost.

**Fruiting** (prestige)
Reach a spore milestone (first at **1 trillion**) to trigger a Fruiting
Event: the network collapses back to a single spore, but releases **Mycosin**
proportional to the total spores reached. Three tiers (Primordium →
Sporocarp → Sporulation) with rising thresholds and richer yields. The early
game creeps; after the first fruiting it accelerates sharply.

## Saving

Progress autosaves to `localStorage` every 20s and on exit. Closing the tab
banks up to 8h of offline growth at 50% efficiency. *Sterilize* wipes
everything, including permanent mycosin.

## Files

- `index.html` — layout
- `style.css` — dark biological theme + CSS animations (pulsing/creeping mycelium)
- `game.js` — engine: resources, producers, upgrades, prestige, save/load, SVG visualization
