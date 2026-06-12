"use strict";

/* ============================================================
   HYPHAE — substrate colonization interface
   An incremental idle game. Pure vanilla JS, no dependencies.
   ============================================================ */

/* ---------- number formatting ---------- */
const SUFFIXES = [
  "", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No",
  "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc",
  "Vg", "UVg", "DVg", "TVg", "QaVg", "QiVg", "SxVg", "SpVg", "OcVg", "NoVg", "Tg"
];

function fmt(n) {
  if (n === Infinity) return "∞";
  if (n === 0) return "0";
  if (n < 0) return "-" + fmt(-n);
  if (n < 1000) {
    // small numbers: keep a little precision
    if (n < 10 && n % 1 !== 0) return n.toFixed(2);
    if (n < 100 && n % 1 !== 0) return n.toFixed(1);
    return Math.floor(n).toString();
  }
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier < SUFFIXES.length) {
    const scaled = n / Math.pow(1000, tier);
    return scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0) + SUFFIXES[tier];
  }
  // beyond named suffixes: scientific notation
  const exp = Math.floor(Math.log10(n));
  const mant = n / Math.pow(10, exp);
  return mant.toFixed(2) + "e" + exp;
}

function fmtRate(n) {
  return fmt(n) + "/s";
}

/* ---------- definitions ---------- */
// Producers unlock in sequence. `unlock` is a predicate on state.
const PRODUCERS = [
  {
    id: "thread",
    name: "Mycelium Thread",
    desc: "A single hypha probing the dark. Baseline spore generator — cheap, patient, relentless.",
    costSpores: 15, costBiomass: 0, growth: 1.15,
    baseSpores: 0.1, baseBiomass: 0,
    unlock: () => true
  },
  {
    id: "rhizomorph",
    name: "Rhizomorph",
    desc: "Bundled hyphae forming a conductive cord. Channels spores far faster than a lone thread.",
    costSpores: 120, costBiomass: 25, growth: 1.16,
    baseSpores: 1.1, baseBiomass: 0,
    unlock: (s) => s.producers.thread.count >= 10
  },
  {
    id: "decomposer",
    name: "Decomposer Node",
    desc: "Settles into rotting wood, secreting enzymes. Yields both spores and biomass as it digests.",
    costSpores: 1400, costBiomass: 80, growth: 1.18,
    baseSpores: 5, baseBiomass: 0.4,
    unlock: (s) => s.producers.rhizomorph.count >= 5
  },
  {
    id: "moisture",
    name: "Moisture Tap",
    desc: "Draws from buried water mains. Does not produce alone — boosts thread & rhizomorph output globally.",
    costSpores: 22000, costBiomass: 400, growth: 1.20,
    baseSpores: 0, baseBiomass: 0,
    moistureBoost: 0.04, // +4% to threads/rhizomorphs per tap (×Root Mimicry)
    unlock: (s) => s.producers.decomposer.count >= 5
  },
  {
    id: "sporecloud",
    name: "Spore Cloud",
    desc: "A suspended haze of airborne propagules. Massive passive spore generation across its drift radius.",
    costSpores: 1.5e6, costBiomass: 4000, growth: 1.22,
    baseSpores: 320, baseBiomass: 0,
    unlock: (s) => s.producers.moisture.count >= 3 || s.totalSpores >= 5e5
  },
  {
    id: "symbiotic",
    name: "Symbiotic Net",
    desc: "A mutualist web wired into every structure. Multiplies all spore output by the breadth of the colony.",
    costSpores: 9e8, costBiomass: 2.5e5, growth: 1.25,
    baseSpores: 0, baseBiomass: 0,
    unlock: (s) => s.producers.sporecloud.count >= 5
  },
  {
    id: "biolum",
    name: "Bioluminescent Colony",
    desc: "Glowing fruiting mass that compounds upon itself. Spore output scales exponentially — at ruinous biomass cost.",
    costSpores: 1e12, costBiomass: 5e8, growth: 1.30,
    baseSpores: 5e4, baseBiomass: 0,
    biolumExp: 1.04, // each colony multiplies its own tier output
    unlock: (s) => s.producers.symbiotic.count >= 8 || s.totalSpores >= 1e11
  }
];

const UPGRADES = [
  {
    id: "cellwalls",
    name: "Thicker Cell Walls",
    desc: "Reinforced chitin. Mycelium Thread output ×2.",
    costSpores: 500, costBiomass: 0, growth: 6, max: 12,
    apply: (s, lvl) => { MULT.thread *= Math.pow(2, lvl); }
  },
  {
    id: "conductive",
    name: "Conductive Cords",
    desc: "Streamlined nutrient transport. Rhizomorph output ×2.",
    costSpores: 6000, costBiomass: 200, growth: 6.5, max: 12,
    unlock: (s) => s.producers.rhizomorph.count >= 1,
    apply: (s, lvl) => { MULT.rhizomorph *= Math.pow(2, lvl); }
  },
  {
    id: "enzymatic",
    name: "Enzymatic Boost",
    desc: "Aggressive enzyme cocktail. Decomposer Nodes produce +50% biomass per level.",
    costSpores: 40000, costBiomass: 1500, growth: 5, max: 15,
    unlock: (s) => s.producers.decomposer.count >= 1,
    apply: (s, lvl) => { MULT.decomposerBiomass *= Math.pow(1.5, lvl); }
  },
  {
    id: "rootmimicry",
    name: "Root Mimicry",
    desc: "Taps mimic vascular roots. Moisture Taps work 3× as effectively per level.",
    costSpores: 9e5, costBiomass: 1.2e4, growth: 7, max: 8,
    unlock: (s) => s.producers.moisture.count >= 1,
    apply: (s, lvl) => { MULT.moisture *= Math.pow(3, lvl); }
  },
  {
    id: "airborne",
    name: "Airborne Adaptation",
    desc: "Lighter, lofted spores. Spore Cloud drift range (output) ×2 per level.",
    costSpores: 5e7, costBiomass: 8e4, growth: 6, max: 12,
    unlock: (s) => s.producers.sporecloud.count >= 1,
    apply: (s, lvl) => { MULT.sporecloud *= Math.pow(2, lvl); }
  },
  {
    id: "lattice",
    name: "Mycelial Lattice",
    desc: "Denser cross-linking. Symbiotic Net multiplier gains +0.1 per producer per level.",
    costSpores: 2e10, costBiomass: 5e6, growth: 8, max: 10,
    unlock: (s) => s.producers.symbiotic.count >= 1,
    apply: (s, lvl) => { MULT.latticePerProducer += 0.1 * lvl; }
  },
  {
    id: "darkmetab",
    name: "Dark Metabolism",
    desc: "Colony-wide efficiency in the absence of light. ALL spore production ×1.8 per level.",
    costSpores: 1e9, costBiomass: 0, growth: 12, max: 20,
    unlock: (s) => s.totalSpores >= 1e8,
    apply: (s, lvl) => { MULT.global *= Math.pow(1.8, lvl); }
  },
  {
    id: "saprophage",
    name: "Saprophagic Frenzy",
    desc: "Voracious decay. ALL biomass production ×2 per level.",
    costSpores: 0, costBiomass: 3e4, growth: 9, max: 15,
    unlock: (s) => s.totalBiomass >= 2e4,
    apply: (s, lvl) => { MULT.globalBiomass *= Math.pow(2, lvl); }
  },
  {
    id: "phosphor",
    name: "Phosphorescence",
    desc: "Self-feeding glow. Bioluminescent Colony exponential base raised per level.",
    costSpores: 5e13, costBiomass: 1e10, growth: 20, max: 6,
    unlock: (s) => s.producers.biolum.count >= 1,
    apply: (s, lvl) => { MULT.biolumExpBonus += 0.015 * lvl; }
  }
];

// Fruiting (prestige) tiers
const FRUIT_TIERS = [
  { threshold: 1e12, name: "Primordium",   mult: 0.04 },
  { threshold: 1e21, name: "Sporocarp",    mult: 0.10 },
  { threshold: 1e30, name: "Sporulation",  mult: 0.22 }
];

// Mycosin awarded scales with total spores reached this run.
function mycosinFor(totalSpores, tierIndex) {
  if (totalSpores < FRUIT_TIERS[0].threshold) return 0;
  const tier = FRUIT_TIERS[Math.min(tierIndex, FRUIT_TIERS.length - 1)];
  // gentle root curve so it grows but never explodes
  const base = Math.pow(totalSpores / FRUIT_TIERS[0].threshold, 0.18);
  return Math.floor(base * tier.mult * 100) / 10; // one decimal
}

/* ---------- state ---------- */
let state;

function freshState() {
  const producers = {};
  for (const p of PRODUCERS) producers[p.id] = { count: 0 };
  const upgrades = {};
  for (const u of UPGRADES) upgrades[u.id] = { level: 0 };
  return {
    spores: 0,
    biomass: 0,
    mycosin: 0,
    totalSpores: 0,      // this run, for prestige calc
    totalBiomass: 0,     // this run
    lifetimeSpores: 0,   // all-time, for unlocks/log
    fruitings: 0,
    producers,
    upgrades,
    unlockedProducers: {}, // sticky unlock flags
    seenLogs: {},
    lastSave: Date.now(),
    lastTick: Date.now()
  };
}

/* ---------- multiplier bus (recomputed each frame) ---------- */
let MULT;
function resetMult() {
  MULT = {
    thread: 1, rhizomorph: 1, decomposer: 1, decomposerBiomass: 1,
    moisture: 1, sporecloud: 1, symbiotic: 1,
    global: 1, globalBiomass: 1,
    latticePerProducer: 0.5,
    biolumExpBonus: 0
  };
}

/* ---------- production math ---------- */
function totalProducerCount() {
  let n = 0;
  for (const p of PRODUCERS) n += state.producers[p.id].count;
  return n;
}

function mycosinMultiplier() {
  // each mycosin gives +10% global spore production
  return 1 + state.mycosin * 0.1;
}

// Returns { spores, biomass } per-second production.
function computeProduction() {
  resetMult();
  // apply upgrades
  for (const u of UPGRADES) {
    const lvl = state.upgrades[u.id].level;
    if (lvl > 0) u.apply(state, lvl);
  }

  const counts = {};
  for (const p of PRODUCERS) counts[p.id] = state.producers[p.id].count;

  // moisture boost factor applies to threads + rhizomorphs
  const moistureFactor = 1 + counts.moisture * 0.04 * MULT.moisture;

  // symbiotic net multiplier: based on total producer count
  const symCount = counts.symbiotic;
  const symMult = symCount > 0
    ? 1 + symCount * (MULT.latticePerProducer * totalProducerCount() * 0.01)
    : 1;

  // bioluminescent exponential: output per colony compounds
  const biolumDef = PRODUCERS.find(p => p.id === "biolum");
  const biolumExp = biolumDef.biolumExp + MULT.biolumExpBonus;
  const biolumCount = counts.biolum;
  const biolumMult = biolumCount > 0 ? Math.pow(biolumExp, biolumCount) : 1;

  let spores = 0, biomass = 0;

  for (const p of PRODUCERS) {
    const c = counts[p.id];
    if (c === 0) continue;
    let s = p.baseSpores * c;
    let b = p.baseBiomass * c;

    if (p.id === "thread")      { s *= MULT.thread * moistureFactor; }
    if (p.id === "rhizomorph")  { s *= MULT.rhizomorph * moistureFactor; }
    if (p.id === "decomposer")  { s *= MULT.decomposer; b *= MULT.decomposerBiomass; }
    if (p.id === "sporecloud")  { s *= MULT.sporecloud; }
    if (p.id === "biolum")      { s *= biolumMult; }

    spores += s;
    biomass += b;
  }

  // colony-wide multipliers
  spores *= MULT.global * symMult * mycosinMultiplier();
  biomass *= MULT.globalBiomass;

  return { spores, biomass, symMult, moistureFactor, biolumMult };
}

/* ---------- cost math (geometric series for bulk buys) ---------- */
function producerCostFor(p, owned, amount, which) {
  // which: "spores" or "biomass"
  const base = which === "spores" ? p.costSpores : p.costBiomass;
  if (base === 0) return 0;
  const g = p.growth;
  // sum of base*g^owned ... base*g^(owned+amount-1)
  const start = base * Math.pow(g, owned);
  return start * (Math.pow(g, amount) - 1) / (g - 1);
}

function maxAffordable(p, owned) {
  // limited by whichever resource is required
  let limit = Infinity;
  if (p.costSpores > 0) {
    const g = p.growth, start = p.costSpores * Math.pow(g, owned);
    // largest n with start*(g^n -1)/(g-1) <= spores
    const val = state.spores * (g - 1) / start + 1;
    limit = Math.min(limit, val > 1 ? Math.floor(Math.log(val) / Math.log(g)) : 0);
  }
  if (p.costBiomass > 0) {
    const g = p.growth, start = p.costBiomass * Math.pow(g, owned);
    const val = state.biomass * (g - 1) / start + 1;
    limit = Math.min(limit, val > 1 ? Math.floor(Math.log(val) / Math.log(g)) : 0);
  }
  return Math.max(0, limit);
}

function upgradeCost(u, level, which) {
  const base = which === "spores" ? u.costSpores : u.costBiomass;
  if (base === 0) return 0;
  return base * Math.pow(u.growth, level);
}

/* ---------- buying ---------- */
let buyMode = 1; // 1, 10, or "max"

function buyProducer(p) {
  const owned = state.producers[p.id].count;
  let amount = buyMode === "max" ? maxAffordable(p, owned) : buyMode;
  if (amount <= 0) return;

  if (buyMode !== "max") {
    // verify affordability of fixed amount
    const cs = producerCostFor(p, owned, amount, "spores");
    const cb = producerCostFor(p, owned, amount, "biomass");
    if (cs > state.spores || cb > state.biomass) return;
  }
  const cs = producerCostFor(p, owned, amount, "spores");
  const cb = producerCostFor(p, owned, amount, "biomass");
  if (cs > state.spores + 1e-6 || cb > state.biomass + 1e-6) return;

  state.spores -= cs;
  state.biomass -= cb;
  state.producers[p.id].count += amount;
  sfx("buy");
  flashProducer(p.id);
  renderAll();
}

function buyUpgrade(u) {
  const lvl = state.upgrades[u.id].level;
  if (u.max && lvl >= u.max) return;
  const cs = upgradeCost(u, lvl, "spores");
  const cb = upgradeCost(u, lvl, "biomass");
  if (cs > state.spores + 1e-6 || cb > state.biomass + 1e-6) return;
  state.spores -= cs;
  state.biomass -= cb;
  state.upgrades[u.id].level += 1;
  sfx("upgrade");
  log(`adaptation acquired :: ${u.name} [lvl ${state.upgrades[u.id].level}]`);
  renderAll();
}

/* ---------- fruiting (prestige) ---------- */
function currentFruitTier() {
  return Math.min(state.fruitings, FRUIT_TIERS.length - 1);
}
function nextThreshold() {
  return FRUIT_TIERS[currentFruitTier()].threshold;
}
function canFruit() {
  return state.totalSpores >= nextThreshold();
}

function doFruit() {
  if (!canFruit()) return;
  const tierIdx = currentFruitTier();
  const gain = mycosinFor(state.totalSpores, tierIdx);
  if (gain <= 0) return;
  state.mycosin += gain;
  state.fruitings += 1;
  const tierName = FRUIT_TIERS[tierIdx].name;

  // reset run progress
  for (const p of PRODUCERS) state.producers[p.id].count = 0;
  for (const u of UPGRADES) state.upgrades[u.id].level = 0;
  state.spores = 0;
  state.biomass = 0;
  state.totalSpores = 0;
  state.totalBiomass = 0;

  sfx("fruit");
  fireFruitFlash();
  bump("r-mycosin");
  log(`◆ FRUITING EVENT — ${tierName}. colony released ${fmt(gain)} mycosin into the substrate.`);
  log(`◆ network collapsed to spores. permanent yield now ×${mycosinMultiplier().toFixed(2)}.`);
  buildViz(true);
  renderAll();
  save();
}

/* ---------- logging ---------- */
const LOG_MAX = 7;
let logLines = [];
function log(msg, once) {
  if (once) {
    if (state.seenLogs[once]) return;
    state.seenLogs[once] = true;
  }
  logLines.unshift(msg);
  if (logLines.length > LOG_MAX) logLines.pop();
  renderLog();
}
function renderLog() {
  const el = document.getElementById("log-lines");
  el.innerHTML = logLines.map(l => `<div class="log-line">${l}</div>`).join("");
}

/* ---------- unlock tracking ---------- */
function checkUnlocks() {
  for (const p of PRODUCERS) {
    if (!state.unlockedProducers[p.id] && p.unlock(state)) {
      state.unlockedProducers[p.id] = true;
      if (p.id !== "thread") {
        log(`new structure viable :: ${p.name}`, "unlock_" + p.id);
        sfx("unlockChime");
      }
    }
  }
}
function isProducerVisible(p) {
  return state.unlockedProducers[p.id] || p.unlock(state);
}
function isUpgradeVisible(u) {
  return !u.unlock || u.unlock(state);
}

/* ============================================================
   UI FEEDBACK HELPERS (animation / audio glue)
   ============================================================ */
function sfx(method, arg) {
  // audio.js is optional; never let a missing engine break the game
  if (window.Sound && typeof Sound[method] === "function") Sound[method](arg);
}

function bump(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("bump");
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add("bump");
}

function flashProducer(id) {
  const el = producerEls[id];
  if (!el) return;
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

function floatGain(text) {
  const btn = document.getElementById("digest-btn");
  if (!btn) return;
  const f = document.createElement("div");
  f.className = "float-gain";
  f.textContent = text;
  btn.appendChild(f);
  setTimeout(() => f.remove(), 950);
}

function fireFruitFlash() {
  const el = document.getElementById("fruit-flash");
  if (!el) return;
  el.classList.remove("fire");
  void el.offsetWidth;
  el.classList.add("fire");
}

/* ============================================================
   RENDERING
   ============================================================ */
let lastProd = { spores: 0, biomass: 0 };

function renderResources() {
  document.getElementById("r-spores").textContent = fmt(state.spores);
  document.getElementById("r-biomass").textContent = fmt(state.biomass);
  document.getElementById("r-mycosin").textContent = fmt(state.mycosin);
  document.getElementById("r-sps").textContent = fmtRate(lastProd.spores);
  document.getElementById("r-bps").textContent = fmtRate(lastProd.biomass);
  document.getElementById("r-mycomult").textContent = "×" + mycosinMultiplier().toFixed(2);
  document.getElementById("digest-yield").textContent =
    `+${fmt(digestYield().spores)} spore · +${fmt(digestYield().biomass)} biomass`;
}

function digestYield() {
  // manual click yields a tiny bit, scaling slightly with mycosin so it stays relevant
  const m = mycosinMultiplier();
  return { spores: 1 * m, biomass: 0.5 * m };
}

let producerEls = {};
function buildProducerList() {
  const list = document.getElementById("producer-list");
  list.innerHTML = "";
  producerEls = {};
  for (const p of PRODUCERS) {
    const div = document.createElement("div");
    div.className = "prod";
    div.dataset.id = p.id;
    list.appendChild(div);
    producerEls[p.id] = div;
  }
  // placeholder shown when nothing else is visible yet
}

function renderProducers() {
  const prod = computeProduction();
  let anyVisible = false;
  let firstHidden = null;

  for (const p of PRODUCERS) {
    const el = producerEls[p.id];
    const visible = isProducerVisible(p);
    if (!visible) {
      if (!firstHidden) firstHidden = p;
      el.style.display = "none";
      continue;
    }
    anyVisible = true;
    el.style.display = "";
    el.classList.remove("placeholder");

    const owned = state.producers[p.id].count;
    const amount = buyMode === "max" ? Math.max(1, maxAffordable(p, owned)) : buyMode;
    const cs = producerCostFor(p, owned, buyMode === "max" ? maxAffordable(p, owned) : buyMode, "spores");
    const cb = producerCostFor(p, owned, buyMode === "max" ? maxAffordable(p, owned) : buyMode, "biomass");
    const canBuy = (buyMode === "max" ? maxAffordable(p, owned) > 0 : true)
      && cs <= state.spores + 1e-6 && cb <= state.biomass + 1e-6;

    if (canBuy) el.classList.add("affordable"); else el.classList.remove("affordable");

    // per-unit production description
    let unitTxt = "";
    if (p.id === "moisture") {
      unitTxt = `each: +4% thread/rhizomorph output (×${MULT_PREVIEW("moisture")})`;
    } else if (p.id === "symbiotic") {
      unitTxt = `each: scales spore output with total colony size`;
    } else if (p.id === "biolum") {
      unitTxt = `each: ×${(PRODUCERS.find(x=>x.id==="biolum").biolumExp + MULT.biolumExpBonus).toFixed(3)} compounding spore output`;
    } else {
      const parts = [];
      if (p.baseSpores) parts.push(`${fmt(p.baseSpores)} spores/s`);
      if (p.baseBiomass) parts.push(`${fmt(p.baseBiomass)} biomass/s`);
      unitTxt = "each: " + parts.join(" · ") + " (base)";
    }

    const costParts = [];
    if (p.costSpores > 0) {
      const cls = cs <= state.spores ? "" : "too-expensive";
      costParts.push(`<span class="prod-cost ${cls}">${fmt(cs)} spores</span>`);
    }
    if (p.costBiomass > 0) {
      const cls = cb <= state.biomass ? "biomass-cost" : "biomass-cost too-expensive";
      costParts.push(`<span class="prod-cost ${cls}">${fmt(cb)} biomass</span>`);
    }

    el.innerHTML = `
      <div class="prod-head">
        <span class="prod-name">${p.name}</span>
        <span class="prod-count">×${owned}</span>
      </div>
      <div class="prod-desc">${p.desc}</div>
      <div class="prod-stats">${unitTxt}</div>
      <div class="prod-buy">
        ${costParts.join(" ")}
        <button class="buy-btn" ${canBuy ? "" : "disabled"}>
          ${buyMode === "max" ? "max" : "+" + buyMode}
        </button>
      </div>`;
    el.querySelector(".buy-btn").onclick = () => buyProducer(p);
  }

  // first locked producer => teaser placeholder
  if (firstHidden) {
    const el = producerEls[firstHidden.id];
    el.style.display = "";
    el.classList.add("placeholder");
    el.innerHTML = "▒▒ undifferentiated substrate ▒▒";
  }
}

function MULT_PREVIEW(id) {
  // compute current multiplier value for display
  resetMult();
  for (const u of UPGRADES) {
    const lvl = state.upgrades[u.id].level;
    if (lvl > 0) u.apply(state, lvl);
  }
  return MULT[id] ? MULT[id].toFixed(0) : "1";
}

let upgradeEls = {};
function buildUpgradeList() {
  const list = document.getElementById("upgrade-list");
  list.innerHTML = "";
  upgradeEls = {};
}

function renderUpgrades() {
  const list = document.getElementById("upgrade-list");
  // determine visible upgrades and sort by effective spore-equivalent cost
  const visible = UPGRADES.filter(isUpgradeVisible).filter(u => {
    const lvl = state.upgrades[u.id].level;
    return !(u.max && lvl >= u.max);
  });
  visible.sort((a, b) => {
    const ca = upgradeCost(a, state.upgrades[a.id].level, "spores") + upgradeCost(a, state.upgrades[a.id].level, "biomass") * 50;
    const cb = upgradeCost(b, state.upgrades[b.id].level, "spores") + upgradeCost(b, state.upgrades[b.id].level, "biomass") * 50;
    return ca - cb;
  });

  // rebuild only if set/order changed
  const sig = visible.map(u => u.id).join(",");
  if (list.dataset.sig !== sig) {
    list.innerHTML = "";
    upgradeEls = {};
    for (const u of visible) {
      const div = document.createElement("div");
      div.className = "upg";
      div.dataset.id = u.id;
      list.appendChild(div);
      upgradeEls[u.id] = div;
    }
    list.dataset.sig = sig;
  }
  if (visible.length === 0) {
    list.innerHTML = `<div class="prod placeholder">▒▒ no adaptations available ▒▒</div>`;
    list.dataset.sig = "";
    return;
  }

  for (const u of visible) {
    const el = upgradeEls[u.id];
    if (!el) continue;
    const lvl = state.upgrades[u.id].level;
    const cs = upgradeCost(u, lvl, "spores");
    const cb = upgradeCost(u, lvl, "biomass");
    const canBuy = cs <= state.spores + 1e-6 && cb <= state.biomass + 1e-6;
    if (canBuy) el.classList.add("affordable"); else el.classList.remove("affordable");

    const costParts = [];
    if (u.costSpores > 0) {
      costParts.push(`<span class="upg-cost ${cs <= state.spores ? "" : "too-expensive"}">${fmt(cs)} spores</span>`);
    }
    if (u.costBiomass > 0) {
      costParts.push(`<span class="upg-cost biomass-cost ${cb <= state.biomass ? "" : "too-expensive"}">${fmt(cb)} biomass</span>`);
    }
    const lvlTxt = u.max ? `lvl ${lvl}/${u.max}` : `lvl ${lvl}`;

    el.innerHTML = `
      <div class="upg-head">
        <span class="upg-name">${u.name}</span>
        <span class="upg-level">${lvlTxt}</span>
      </div>
      <div class="upg-desc">${u.desc}</div>
      <div class="upg-buy">
        ${costParts.join(" ")}
        <button class="buy-btn" ${canBuy ? "" : "disabled"}>acquire</button>
      </div>`;
    el.querySelector(".buy-btn").onclick = () => buyUpgrade(u);
  }
}

function renderFruit() {
  const tierIdx = currentFruitTier();
  const tier = FRUIT_TIERS[tierIdx];
  const thr = tier.threshold;
  const pct = Math.min(100, (state.totalSpores / thr) * 100);
  const fill = document.getElementById("fruit-fill");
  fill.style.width = pct.toFixed(2) + "%";
  const ready = canFruit();
  fill.classList.toggle("ready", ready);

  document.getElementById("fruit-meter-text").textContent =
    `${fmt(state.totalSpores)} / ${fmt(thr)} spores (${pct.toFixed(pct < 1 ? 3 : 1)}%)`;

  document.getElementById("fruit-tier-label").textContent =
    `FRUITING — ${tier.name}` + (state.fruitings > 0 ? ` · ${state.fruitings} event${state.fruitings>1?"s":""} survived` : "");

  const btn = document.getElementById("fruit-btn");
  const gain = mycosinFor(state.totalSpores, tierIdx);
  btn.disabled = !ready;
  btn.classList.toggle("armed", ready);
  document.getElementById("fruit-btn-main").textContent = ready ? "FRUIT NOW" : "FRUIT";
  document.getElementById("fruit-btn-sub").textContent = ready
    ? `release ${fmt(gain)} mycosin`
    : `reach ${fmt(thr)} spores`;
}

function renderAll() {
  checkUnlocks();
  renderResources();
  renderProducers();
  renderUpgrades();
  renderFruit();
}

/* ============================================================
   FOREGROUND VISUALIZATION (network growth)
   ============================================================ */
const VIZ_W = 260, VIZ_H = 300;
let vizSegments = [];
function buildViz(reset) {
  const svg = document.getElementById("viz");
  if (reset) { svg.innerHTML = ""; vizSegments = []; }
}

function vizTargetSegments() {
  // network complexity tracks total producers (capped for performance)
  return Math.min(140, 6 + totalProducerCount());
}

function growViz() {
  const svg = document.getElementById("viz");
  const target = vizTargetSegments();
  while (vizSegments.length < target) {
    addVizSegment(svg);
  }
}

function addVizSegment(svg) {
  let x, y, ang;
  if (vizSegments.length === 0) {
    x = VIZ_W / 2; y = VIZ_H - 8; ang = -Math.PI / 2;
  } else {
    const parent = vizSegments[Math.floor(Math.random() * vizSegments.length)];
    x = parent.x2; y = parent.y2;
    ang = parent.ang + (Math.random() - 0.5) * 1.3;
  }
  const len = 14 + Math.random() * 22;
  let x2 = x + Math.cos(ang) * len;
  let y2 = y + Math.sin(ang) * len;
  // keep inside box, bias upward (growth from base)
  x2 = Math.max(6, Math.min(VIZ_W - 6, x2));
  y2 = Math.max(6, Math.min(VIZ_H - 6, y2));

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x.toFixed(1));
  line.setAttribute("y1", y.toFixed(1));
  line.setAttribute("x2", x2.toFixed(1));
  line.setAttribute("y2", y2.toFixed(1));
  const seglen = Math.hypot(x2 - x, y2 - y);
  line.style.setProperty("--seglen", seglen.toFixed(1));
  line.style.strokeDasharray = seglen.toFixed(1);
  line.setAttribute("class", "vl new");
  line.style.animationDelay = (Math.random() * 4) + "s";
  svg.appendChild(line);

  // occasional glowing node (fruiting body)
  if (Math.random() < 0.22) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    node.setAttribute("cx", x2.toFixed(1));
    node.setAttribute("cy", y2.toFixed(1));
    node.setAttribute("r", "2");
    node.setAttribute("class", "vnode");
    node.style.animationDelay = (Math.random() * 4) + "s";
    svg.appendChild(node);
  }

  vizSegments.push({ x, y, x2, y2, ang });
}

/* ---------- background mycelium ---------- */
function buildBackground() {
  const svg = document.getElementById("bg-mycelium");
  const w = window.innerWidth, h = window.innerHeight;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.innerHTML = "";
  const strands = 14;
  for (let i = 0; i < strands; i++) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    let x = Math.random() * w, y = Math.random() * h;
    let d = `M ${x.toFixed(0)} ${y.toFixed(0)}`;
    let ang = Math.random() * Math.PI * 2;
    let total = 0;
    const steps = 6 + Math.floor(Math.random() * 6);
    for (let j = 0; j < steps; j++) {
      ang += (Math.random() - 0.5) * 1.4;
      const seg = 40 + Math.random() * 90;
      const nx = x + Math.cos(ang) * seg;
      const ny = y + Math.sin(ang) * seg;
      d += ` Q ${(x + (nx-x)*0.4).toFixed(0)} ${(y + (ny-y)*0.6).toFixed(0)} ${nx.toFixed(0)} ${ny.toFixed(0)}`;
      total += Math.hypot(nx - x, ny - y);
      x = nx; y = ny;
    }
    path.setAttribute("d", d);
    path.setAttribute("class", "bg-thread");
    path.style.strokeDasharray = total.toFixed(0);
    path.style.setProperty("--dashlen", total.toFixed(0));
    path.style.animationDuration = `${(30 + Math.random()*40).toFixed(0)}s, ${(6 + Math.random()*6).toFixed(0)}s`;
    path.style.animationDelay = `${(-Math.random()*30).toFixed(0)}s, ${(-Math.random()*6).toFixed(0)}s`;
    svg.appendChild(path);
  }
}

/* ============================================================
   GAME LOOP
   ============================================================ */
let lastFrame = performance.now();
function tick(now) {
  const dt = Math.min(0.25, (now - lastFrame) / 1000); // clamp big gaps
  lastFrame = now;

  const prod = computeProduction();
  state.spores += prod.spores * dt;
  state.biomass += prod.biomass * dt;
  state.totalSpores += prod.spores * dt;
  state.totalBiomass += prod.biomass * dt;
  state.lifetimeSpores += prod.spores * dt;
  lastProd = prod;

  requestAnimationFrame(tick);
}

// lighter-weight UI refresh (4x/sec) and viz growth
function uiTick() {
  renderAll();
  growViz();
  milestoneLogs();
}

function milestoneLogs() {
  const t = state.totalSpores;
  if (t >= 1e3) log("colony perceptible to the naked eye.", "m_1e3");
  if (t >= 1e6) log("substrate visibly discolored across the block.", "m_1e6");
  if (t >= 1e9) log("structural integrity of host concrete compromised.", "m_1e9");
  if (t >= 1e11) log("bioluminescence detected in subsurface sampling.", "m_1e11");
  if (canFruit()) log("◆ fruiting threshold reached. sporocarp viable.", "m_fruit" + state.fruitings);
}

/* ============================================================
   SAVE / LOAD
   ============================================================ */
const SAVE_KEY = "hyphae_save_v1";

function save() {
  state.lastSave = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) { /* storage may be unavailable */ }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    state = freshState();
    // merge known fields
    Object.assign(state, {
      spores: data.spores || 0,
      biomass: data.biomass || 0,
      mycosin: data.mycosin || 0,
      totalSpores: data.totalSpores || 0,
      totalBiomass: data.totalBiomass || 0,
      lifetimeSpores: data.lifetimeSpores || 0,
      fruitings: data.fruitings || 0,
      unlockedProducers: data.unlockedProducers || {},
      seenLogs: data.seenLogs || {},
      lastSave: data.lastSave || Date.now()
    });
    if (data.producers) for (const id in state.producers)
      if (data.producers[id]) state.producers[id].count = data.producers[id].count || 0;
    if (data.upgrades) for (const id in state.upgrades)
      if (data.upgrades[id]) state.upgrades[id].level = data.upgrades[id].level || 0;

    // offline progress
    const elapsed = Math.max(0, (Date.now() - state.lastSave) / 1000);
    if (elapsed > 5) applyOffline(elapsed);
    return true;
  } catch (e) {
    return false;
  }
}

function applyOffline(seconds) {
  const cap = Math.min(seconds, 60 * 60 * 8); // cap offline at 8h
  const prod = computeProduction();
  const eff = 0.5; // offline runs at 50% efficiency
  const ds = prod.spores * cap * eff;
  const db = prod.biomass * cap * eff;
  state.spores += ds; state.biomass += db;
  state.totalSpores += ds; state.totalBiomass += db;
  state.lifetimeSpores += ds;
  if (ds > 0 || db > 0) {
    log(`dormancy ${fmtTime(cap)} :: +${fmt(ds)} spores, +${fmt(db)} biomass (50% rate)`);
  }
}

function fmtTime(s) {
  if (s < 60) return Math.floor(s) + "s";
  if (s < 3600) return Math.floor(s/60) + "m";
  return Math.floor(s/3600) + "h " + Math.floor((s%3600)/60) + "m";
}

function wipe() {
  if (!confirm("STERILIZE: erase the entire colony and all permanent mycosin? This cannot be undone.")) return;
  localStorage.removeItem(SAVE_KEY);
  state = freshState();
  logLines = [];
  buildProducerList();
  buildUpgradeList();
  buildViz(true);
  log("substrate sterilized. a single spore remains.");
  renderAll();
}

/* ============================================================
   BOOT
   ============================================================ */
function setBuyMode(mode, btnEl) {
  buyMode = mode;
  document.querySelectorAll(".buymode-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  renderProducers();
}

function injectBuyModeControls() {
  const center = document.getElementById("center-panel");
  const bar = document.createElement("div");
  bar.id = "buymode-bar";
  bar.style.cssText = "display:flex;gap:6px;margin-bottom:12px;";
  const modes = [["×1",1],["×10",10],["max","max"]];
  for (const [label, m] of modes) {
    const b = document.createElement("button");
    b.className = "buymode-btn buy-btn";
    b.textContent = label;
    b.style.flex = "1";
    if (m === buyMode) b.classList.add("active");
    b.onclick = () => setBuyMode(m, b);
    bar.appendChild(b);
  }
  center.querySelector(".panel-title").after(bar);
}

function initAudioControls() {
  const sfxBtn = document.getElementById("sfx-toggle");
  const musicBtn = document.getElementById("music-toggle");
  const vol = document.getElementById("vol-slider");
  if (!sfxBtn || !musicBtn || !vol || !window.Sound) return;

  const reflectSfx = (on) => {
    sfxBtn.classList.toggle("on", on);
    sfxBtn.setAttribute("aria-pressed", String(on));
    sfxBtn.textContent = "sfx " + (on ? "◼" : "◻");
  };
  const reflectMusic = (on) => {
    musicBtn.classList.toggle("on", on);
    musicBtn.setAttribute("aria-pressed", String(on));
    musicBtn.textContent = "lo-fi " + (on ? "◼" : "◻");
  };

  const st = Sound.getState();
  reflectSfx(st.sfx);
  reflectMusic(st.music);
  vol.value = Math.round(st.vol * 100);

  sfxBtn.onclick = () => reflectSfx(Sound.toggleSfx());
  musicBtn.onclick = () => reflectMusic(Sound.toggleMusic());
  vol.oninput = () => Sound.setVolume(vol.value / 100);

  // Browser autoplay policy: audio can only begin from a user gesture.
  // Start whatever the player had enabled on their first interaction.
  const prime = () => {
    Sound.primeFromGesture();
    window.removeEventListener("pointerdown", prime);
    window.removeEventListener("keydown", prime);
  };
  window.addEventListener("pointerdown", prime);
  window.addEventListener("keydown", prime);
}

function init() {
  state = freshState();
  const loaded = load();

  buildBackground();
  buildProducerList();
  buildUpgradeList();
  injectBuyModeControls();
  buildViz(true);

  if (loaded) {
    log("colony state restored from substrate archive.");
  } else {
    log("inoculation successful. a single spore takes hold in the dark.");
  }

  // initial viz fill
  for (let i = 0; i < Math.min(40, vizTargetSegments()); i++) addVizSegment(document.getElementById("viz"));

  document.getElementById("digest-btn").onclick = () => {
    const y = digestYield();
    state.spores += y.spores;
    state.biomass += y.biomass;
    state.totalSpores += y.spores;
    state.totalBiomass += y.biomass;
    state.lifetimeSpores += y.spores;
    renderResources();
    sfx("digest");
    floatGain(`+${fmt(y.spores)} spore${y.spores >= 2 ? "s" : ""}`);
    bump("r-spores");
    if (y.biomass > 0) bump("r-biomass");
  };
  document.getElementById("fruit-btn").onclick = doFruit;
  document.getElementById("save-btn").onclick = () => { sfx("click"); save(); log("state archived to local substrate."); };
  document.getElementById("wipe-btn").onclick = wipe;

  initAudioControls();

  window.addEventListener("resize", buildBackground);
  window.addEventListener("beforeunload", save);

  renderAll();
  requestAnimationFrame(tick);
  setInterval(uiTick, 250);
  setInterval(save, 20000); // autosave
}

// active-style highlight for buy mode buttons
const styleEl = document.createElement("style");
styleEl.textContent = ".buymode-btn.active{background:#1f311f;border-color:#5a7d5a;color:#a8d4a8;}";
document.head.appendChild(styleEl);

document.addEventListener("DOMContentLoaded", init);
