import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Beer, Coffee, CupSoda, TrendingUp, Store, Flame, Package, Home, Landmark, Globe2, Globe,
  UserCheck, Zap, Trophy, BarChart3,
  ChevronRight, Coins, Users, RefreshCw,
  X, AlertTriangle, Star, Activity, Flag,
  Lock,
  PenLine, CreditCard, Milk, LayoutGrid, Clock, Tv, Cookie, Wifi, Car, Smartphone, Building, Map, Sun, BookOpen,
  Film, Calculator, Gift, Plane, Heart, ShoppingBag, Crown,
} from "lucide-react";

// ─── GAME DATA ────────────────────────────────────────────────────────────────

const BUSINESSES = [
  {
    id: "pavement", name: "Flat White's", shortName: "Flat White's", world: 1,
    Icon: Coffee, color: "#5cb85c", darkColor: "#2e6e2e",
    baseDuration: 800,   baseProfit: 1.5,   upgradeCostBase: 25,
    managerCost: 75,    managerName: "Jude",
  },
  {
    id: "brewbar", name: "The Bishopton Bar", shortName: "Bishopton Bar", world: 1,
    Icon: Beer, color: "#e8a020", darkColor: "#8a5c08",
    baseDuration: 3000,  baseProfit: 8,     upgradeCostBase: 120,
    managerCost: 350,   managerName: "Felix",
  },
  {
    id: "coffeehouse", name: "White's Coffee House", shortName: "Coffee House", world: 1,
    Icon: CupSoda, color: "#c0784a", darkColor: "#7a4018",
    baseDuration: 8000,  baseProfit: 40,    upgradeCostBase: 500,
    managerCost: 1500,  managerName: "Matthew",
  },
  {
    id: "industrial", name: "Mr. Whitebucks", shortName: "Whitebucks", world: 1,
    Icon: TrendingUp, color: "#5b8fa8", darkColor: "#2a5068",
    baseDuration: 30000, baseProfit: 250,   upgradeCostBase: 3000,
    managerCost: 10000, managerName: "Jack",
  },
  {
    id: "global", name: "Cafe Bishopton", shortName: "Cafe Bishopton", world: 1,
    Icon: Store, color: "#9b59b6", darkColor: "#5a2878",
    baseDuration: 120000,baseProfit: 2000,  upgradeCostBase: 20000,
    managerCost: 75000, managerName: "Serenity",
  },
  {
    id: "b6", name: "White's Roastery", shortName: "The Roastery", world: 2,
    Icon: Flame, color: "#e05c5c", darkColor: "#8a2020",
    baseDuration: 2000,   baseProfit: 3,     upgradeCostBase: 40,
    managerCost: 120,   managerName: "Big Dave",
  },
  {
    id: "b7", name: "Bishopton Beans", shortName: "Bish Beans", world: 2,
    Icon: Package, color: "#7c6cdc", darkColor: "#3c2c9c",
    baseDuration: 5000,   baseProfit: 15,    upgradeCostBase: 200,
    managerCost: 600,   managerName: "Marlene",
  },
  {
    id: "b8", name: "The White House Café", shortName: "White House", world: 2,
    Icon: Home, color: "#d4845a", darkColor: "#8a4020",
    baseDuration: 12000,  baseProfit: 80,    upgradeCostBase: 800,
    managerCost: 2500,  managerName: "Geoff",
  },
  {
    id: "b9", name: "Bishop's Blend Co.", shortName: "Bishop's Blend", world: 2,
    Icon: Landmark, color: "#4a9aba", darkColor: "#1a5a7a",
    baseDuration: 45000,  baseProfit: 500,   upgradeCostBase: 5000,
    managerCost: 18000, managerName: "Carol",
  },
  {
    id: "b10", name: "White & Co. Worldwide", shortName: "White & Co.", world: 2,
    Icon: Globe2, color: "#c4a030", darkColor: "#7a5800",
    baseDuration: 180000, baseProfit: 4000,  upgradeCostBase: 35000,
    managerCost: 120000, managerName: "Sir Lewis",
  },
];

const WORLD2_UNLOCK_CAFFEINE = 3;
const CUP_COOLDOWN_MS = 30 * 60 * 1000;
const CUP_GAME_MS = 30000;

function isWorld2Locked(game, i) {
  const w = BUSINESSES[i]?.world ?? 1;
  return w === 2 && (game.cafBoosts ?? 0) < WORLD2_UNLOCK_CAFFEINE;
}

function getSuperboostMult(g) {
  const s = g?.superboost;
  if (!s || typeof s.expiresAt !== "number" || typeof s.multiplier !== "number") return 1;
  if (Date.now() >= s.expiresAt) return 1;
  return s.multiplier;
}

function tierFromAvgCupFill(avgPct) {
  if (avgPct >= 80) return { mult: 10, durMs: 300000 };
  if (avgPct >= 60) return { mult: 5, durMs: 300000 };
  if (avgPct >= 40) return { mult: 3, durMs: 240000 };
  if (avgPct >= 20) return { mult: 2, durMs: 180000 };
  return { mult: 1.5, durMs: 120000 };
}

// ─── REBIRTH CONFIG ───────────────────────────────────────────────────────────
// First rebirth needs £25k lifetime (tuned so milestones land first). Each subsequent one needs 3× more.
const REBIRTH_BASE    = 25000;
const REBIRTH_SCALE   = 3;

function rebirthThreshold(rebirthCount) {
  return REBIRTH_BASE * Math.pow(REBIRTH_SCALE, rebirthCount);
}

// How many boosts earned by rebirthing now
function boostsEarned(lifetime, rebirthCount) {
  const th = rebirthThreshold(rebirthCount);
  // Always 1+ base boost, plus one extra per full threshold of lifetime ground past the bar
  return 1 + Math.floor(lifetime / th);
}

// ─── LEVEL MILESTONES (AdVenture-style quantity tiers) ───────────────────────
// Hitting each tier on a business multiplies that business only (profit + speed).
const LEVEL_MILESTONES = [10, 25, 50, 100, 200, 300, 500];

function milestoneCount(level) {
  return LEVEL_MILESTONES.filter((t) => level >= t).length;
}

function milestoneProfitMult(level) {
  let m = 1;
  LEVEL_MILESTONES.forEach((t) => {
    if (level >= t) m *= 1.55;
  });
  return m;
}

function milestoneSpeedMult(level) {
  let m = 1;
  LEVEL_MILESTONES.forEach((t) => {
    if (level >= t) m *= 1.18;
  });
  return m;
}

function nextMilestoneLevel(level) {
  return LEVEL_MILESTONES.find((t) => level < t) ?? null;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const UPGRADES = [
  { id: "fw1", name: "New Kettle", description: "The old one furred up years ago, like.", cost: 50, icon: Coffee, type: "profit", target: "pavement", multiplier: 2, requiresLevel: null },
  { id: "fw2", name: "Chalk Board Menu", description: "Dead professional. Jude wrote it himself.", cost: 200, icon: PenLine, type: "profit", target: "pavement", multiplier: 2, requiresLevel: 5 },
  { id: "fw3", name: "Loyalty Cards", description: "Buy 9, get 1 free. Nobody tracks it.", cost: 800, icon: CreditCard, type: "speed", target: "pavement", multiplier: 1.3, requiresLevel: 10 },
  { id: "fw4", name: "Oat Milk Arrives", description: "Costs a fortune. Triples the queue.", cost: 3000, icon: Milk, type: "profit", target: "pavement", multiplier: 3, requiresLevel: 10 },
  { id: "fw5", name: "Flat White's Goes Viral", description: "TikTok. Nobody knows how.", cost: 15000, icon: Zap, type: "profit", target: "pavement", multiplier: 5, requiresLevel: 25 },
  { id: "bb1", name: "Quiz Machine", description: "Felix rigs it. The locals don't notice.", cost: 150, icon: LayoutGrid, type: "profit", target: "brewbar", multiplier: 2, requiresLevel: null },
  { id: "bb2", name: "Happy Hour", description: "3-5pm. Somehow makes more money.", cost: 600, icon: Clock, type: "speed", target: "brewbar", multiplier: 1.4, requiresLevel: 5 },
  { id: "bb3", name: "Sports Screen", description: "Massive telly. Bolted to the wall.", cost: 2500, icon: Tv, type: "profit", target: "brewbar", multiplier: 2.5, requiresLevel: 10 },
  { id: "bb4", name: "Craft Beer Range", description: "Local brewery. Costs twice as much.", cost: 10000, icon: Beer, type: "profit", target: "brewbar", multiplier: 3, requiresLevel: 25 },
  { id: "bb5", name: "The Bishopton Bar Goes Upmarket", description: "Tablecloths. Matthew disapproves.", cost: 50000, icon: Star, type: "profit", target: "brewbar", multiplier: 5, requiresLevel: 25 },
  { id: "wc1", name: "Proper Espresso Machine", description: "Matthew trained on YouTube. Close enough.", cost: 400, icon: Coffee, type: "profit", target: "coffeehouse", multiplier: 2, requiresLevel: null },
  { id: "wc2", name: "Scones On The Counter", description: "Matthew's nan's recipe. Don't ask.", cost: 1500, icon: Cookie, type: "profit", target: "coffeehouse", multiplier: 2, requiresLevel: 5 },
  { id: "wc3", name: "WiFi Password Sign", description: "Gets them staying longer. Spending more.", cost: 5000, icon: Wifi, type: "speed", target: "coffeehouse", multiplier: 1.5, requiresLevel: 10 },
  { id: "wc4", name: "Coffee Subscription Box", description: "Monthly. People forget to cancel.", cost: 20000, icon: Package, type: "profit", target: "coffeehouse", multiplier: 3, requiresLevel: 25 },
  { id: "wc5", name: "White's Coffee House Franchise", description: "There's one in Durham now. Somehow.", cost: 100000, icon: Store, type: "profit", target: "coffeehouse", multiplier: 5, requiresLevel: 50 },
  { id: "mw1", name: "Drive-Thru Window", description: "Cut a hole in the wall. Jack's idea.", cost: 1000, icon: Car, type: "speed", target: "industrial", multiplier: 1.5, requiresLevel: null },
  { id: "mw2", name: "Mobile App", description: "Jack built it in a weekend. It works, mostly.", cost: 4000, icon: Smartphone, type: "profit", target: "industrial", multiplier: 2, requiresLevel: 5 },
  { id: "mw3", name: "Corporate Catering Deal", description: "Schools. Obviously.", cost: 15000, icon: Building, type: "profit", target: "industrial", multiplier: 3, requiresLevel: 10 },
  { id: "mw4", name: "Whitebucks Gold Card", description: "Premium loyalty. Jack laminated them himself.", cost: 60000, icon: CreditCard, type: "profit", target: "industrial", multiplier: 4, requiresLevel: 25 },
  { id: "mw5", name: "Whitebucks Goes National", description: "There's one in every city. No idea how.", cost: 300000, icon: Map, type: "profit", target: "industrial", multiplier: 6, requiresLevel: 50 },
  { id: "cb1", name: "Outdoor Seating", description: "Two chairs and a plant pot. Very continental.", cost: 2000, icon: Sun, type: "profit", target: "global", multiplier: 2, requiresLevel: null },
  { id: "cb2", name: "Serenity's Famous Cake", description: "She won't share the recipe. Fair enough.", cost: 8000, icon: Cookie, type: "profit", target: "global", multiplier: 2.5, requiresLevel: 5 },
  { id: "cb3", name: "Bishopton Food Festival", description: "Mr White sponsors it. Subtle.", cost: 30000, icon: Flag, type: "speed", target: "global", multiplier: 1.5, requiresLevel: 10 },
  { id: "cb4", name: "Cafe Bishopton Magazine", description: "Free. Nobody reads it. Still helps.", cost: 120000, icon: BookOpen, type: "profit", target: "global", multiplier: 3, requiresLevel: 25 },
  { id: "cb5", name: "Michelin Consideration", description: "They came. They left. We'll take it.", cost: 600000, icon: Star, type: "profit", target: "global", multiplier: 5, requiresLevel: 50 },
  { id: "wr1", name: "Second-Hand Roaster", description: "Big Dave found it on eBay. Smells fine.", cost: 5000, icon: Flame, type: "profit", target: "b6", multiplier: 2, requiresLevel: null },
  { id: "wr2", name: "Custom Bean Blend", description: "White's Own. Tastes like ambition.", cost: 20000, icon: Coffee, type: "profit", target: "b6", multiplier: 2.5, requiresLevel: 5 },
  { id: "wr3", name: "Roastery Tour", description: "£5 a head. Big Dave talks for 45 minutes.", cost: 75000, icon: Users, type: "speed", target: "b6", multiplier: 1.5, requiresLevel: 10 },
  { id: "wr4", name: "Wholesale Contract", description: "Supplying three cafes. Ours, obviously.", cost: 250000, icon: Package, type: "profit", target: "b6", multiplier: 4, requiresLevel: 25 },
  { id: "wr5", name: "Roastery of the Year", description: "County Durham regional finalist. We'll take it.", cost: 1000000, icon: Trophy, type: "profit", target: "b6", multiplier: 6, requiresLevel: 50 },
  { id: "bbn1", name: "Better Bags", description: "Marlene designed them. They're lovely.", cost: 10000, icon: Package, type: "profit", target: "b7", multiplier: 2, requiresLevel: null },
  { id: "bbn2", name: "Farmers Market Stall", description: "Every Saturday. Marlene's in charge.", cost: 40000, icon: ShoppingBag, type: "speed", target: "b7", multiplier: 1.5, requiresLevel: 5 },
  { id: "bbn3", name: "Online Shop", description: "Ships nationwide. Marlene does the parcels.", cost: 150000, icon: Globe, type: "profit", target: "b7", multiplier: 3, requiresLevel: 10 },
  { id: "bbn4", name: "Subscription Boxes", description: "Monthly beans. Very on trend.", cost: 500000, icon: RefreshCw, type: "profit", target: "b7", multiplier: 4, requiresLevel: 25 },
  { id: "bbn5", name: "Supermarket Deal", description: "Bishopton Beans in Waitrose. Marlene cried.", cost: 2000000, icon: Store, type: "profit", target: "b7", multiplier: 7, requiresLevel: 50 },
  { id: "wh1", name: "Period Features", description: "Geoff found original cornicing. Nice.", cost: 20000, icon: Home, type: "profit", target: "b8", multiplier: 2, requiresLevel: null },
  { id: "wh2", name: "Afternoon Tea Menu", description: "Geoff insists on doilies. We allow it.", cost: 80000, icon: Cookie, type: "profit", target: "b8", multiplier: 2.5, requiresLevel: 5 },
  { id: "wh3", name: "Wedding Venue Hire", description: "Geoff officiated one. Legally unclear.", cost: 300000, icon: Heart, type: "speed", target: "b8", multiplier: 1.6, requiresLevel: 10 },
  { id: "wh4", name: "National Heritage Plaque", description: "Made it up. Tourists don't check.", cost: 1000000, icon: Landmark, type: "profit", target: "b8", multiplier: 4, requiresLevel: 25 },
  { id: "wh5", name: "White House TV Feature", description: "Sunday morning programme. Geoff wore a tie.", cost: 5000000, icon: Tv, type: "profit", target: "b8", multiplier: 6, requiresLevel: 50 },
  { id: "bbc1", name: "Premium Packaging", description: "Carol's idea. Gold foil. Very fancy.", cost: 50000, icon: Package, type: "profit", target: "b9", multiplier: 2, requiresLevel: null },
  { id: "bbc2", name: "Corporate Gift Range", description: "Companies buy it. Carol cold-called them all.", cost: 200000, icon: Gift, type: "profit", target: "b9", multiplier: 3, requiresLevel: 5 },
  { id: "bbc3", name: "Airport Concession", description: "Newcastle Terminal 1. Carol negotiated it.", cost: 750000, icon: Plane, type: "speed", target: "b9", multiplier: 1.8, requiresLevel: 10 },
  { id: "bbc4", name: "Bishop's Blend Export", description: "Shipping to Europe. Carol handles customs.", cost: 3000000, icon: Globe, type: "profit", target: "b9", multiplier: 5, requiresLevel: 25 },
  { id: "bbc5", name: "Royal Warrant", description: "Allegedly. Carol's looking into it.", cost: 10000000, icon: Crown, type: "profit", target: "b9", multiplier: 8, requiresLevel: 50 },
  { id: "g1", name: "Mr White's Thermos", description: "Keeps things moving. All businesses faster.", cost: 500, icon: Coffee, type: "global_speed", target: null, multiplier: 1.2, requiresLevel: null },
  { id: "g2", name: "Accountant on Retainer", description: "Sir Lewis recommended him. Very reasonable.", cost: 5000, icon: Calculator, type: "global_profit", target: null, multiplier: 1.5, requiresLevel: null },
  { id: "g3", name: "White's Empire Branding", description: "Same logo everywhere. Looks dead professional.", cost: 25000, icon: Zap, type: "global_profit", target: null, multiplier: 2, requiresLevel: null },
  { id: "g4", name: "Bulk Bean Contract", description: "Direct from origin. Sir Lewis flew out.", cost: 150000, icon: Package, type: "global_profit", target: null, multiplier: 2.5, requiresLevel: null },
  { id: "g5", name: "White's Coffee Empire Documentary", description: "Netflix approached us. We approached them back.", cost: 1000000, icon: Film, type: "global_profit", target: null, multiplier: 4, requiresLevel: null },
  { id: "g6", name: "Mr White Buys Bishopton", description: "The whole village. Technically.", cost: 10000000, icon: Landmark, type: "global_profit", target: null, multiplier: 6, requiresLevel: null },
  { id: "g7", name: "Global Coffee Futures", description: "Sir Lewis explained it. We nodded.", cost: 50000000, icon: TrendingUp, type: "global_profit", target: null, multiplier: 8, requiresLevel: null },
  { id: "g8", name: "White & Co. Goes Public", description: "Stock market. Sir Lewis is handling it.", cost: 200000000, icon: BarChart3, type: "global_profit", target: null, multiplier: 10, requiresLevel: null },
];

const SHOP_SECTIONS = [
  { title: "Flat White's", ids: ["fw1", "fw2", "fw3", "fw4", "fw5"] },
  { title: "Bishopton Bar", ids: ["bb1", "bb2", "bb3", "bb4", "bb5"] },
  { title: "White's Coffee House", ids: ["wc1", "wc2", "wc3", "wc4", "wc5"] },
  { title: "Mr. Whitebucks", ids: ["mw1", "mw2", "mw3", "mw4", "mw5"] },
  { title: "Cafe Bishopton", ids: ["cb1", "cb2", "cb3", "cb4", "cb5"] },
  { title: "White's Roastery", ids: ["wr1", "wr2", "wr3", "wr4", "wr5"] },
  { title: "Bishopton Beans", ids: ["bbn1", "bbn2", "bbn3", "bbn4", "bbn5"] },
  { title: "The White House Café", ids: ["wh1", "wh2", "wh3", "wh4", "wh5"] },
  { title: "Bishop's Blend Co.", ids: ["bbc1", "bbc2", "bbc3", "bbc4", "bbc5"] },
  { title: "Global Upgrades", ids: ["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8"] },
];

function upgradeMultiplier(purchasedUpgrades, businessId, type) {
  return UPGRADES.reduce((mult, u) => {
    if (!purchasedUpgrades.includes(u.id)) return mult;
    if (u.type !== type) return mult;
    if (u.target !== null && u.target !== businessId) return mult;
    return mult * u.multiplier;
  }, 1);
}

function shopTargetLevel(businesses, targetId) {
  if (targetId == null) return 1;
  const i = BUSINESSES.findIndex((b) => b.id === targetId);
  if (i < 0) return 1;
  return businesses[i]?.level ?? 1;
}

const fmt        = (n) => n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
// cafBoost multiplies profit: each boost = +100% profit (global “angel” analogue); superboost stacks multiplicatively
const getProfit  = (def, bs, cafBoosts, superboostMult = 1, purchasedUpgrades = []) => {
  const profMult =
    upgradeMultiplier(purchasedUpgrades, def.id, "profit") *
    upgradeMultiplier(purchasedUpgrades, def.id, "global_profit");
  return def.baseProfit * bs.level * (1 + cafBoosts) * milestoneProfitMult(bs.level) * superboostMult * profMult;
};
// Each level reduces duration by 12%. Caffeine boosts add speed. Milestones add more.
const getDur     = (def, bs, cafBoosts, purchasedUpgrades = []) => {
  const levelSpeedup  = 1 + (bs.level - 1) * 0.12;
  const boostSpeedup  = 1 + cafBoosts * 0.08;
  const upgSpeed =
    upgradeMultiplier(purchasedUpgrades, def.id, "speed") *
    upgradeMultiplier(purchasedUpgrades, def.id, "global_speed");
  return def.baseDuration / (levelSpeedup * boostSpeedup * milestoneSpeedMult(bs.level) * upgSpeed);
};
const UPGRADE_COST_MULT = 1.32;

const getUpgCost = (def, bs) => def.upgradeCostBase * Math.pow(UPGRADE_COST_MULT, bs.level);

function singleUpgradeCost(def, level) {
  return def.upgradeCostBase * Math.pow(UPGRADE_COST_MULT, level);
}

/** How many upgrades can be bought from startLevel with balance (sequential costs). */
function countAffordFromBalance(balance, def, startLevel) {
  let n = 0;
  let bal = balance;
  let L = startLevel;
  while (bal >= singleUpgradeCost(def, L)) {
    bal -= singleUpgradeCost(def, L);
    n++;
    L++;
    if (n > 100_000) break;
  }
  return n;
}

function sumUpgradeCostN(def, startLevel, n) {
  let sum = 0;
  let L = startLevel;
  for (let k = 0; k < n; k++) {
    sum += singleUpgradeCost(def, L);
    L++;
  }
  return sum;
}

// ─── SAVE / OFFLINE (Tier 1) ─────────────────────────────────────────────────
const SAVE_KEY_V5 = "bishoptonEmpire_v5";
const SAVE_KEY_V6 = "bishoptonEmpire_v6";
const SAVE_KEY_V7 = "bishoptonEmpire_v7";
const SAVE_KEY_V8 = "bishoptonEmpire_v8";
const SAVE_KEY_V9 = "bishoptonEmpire_v9";
const MAX_OFFLINE_MS = 48 * 60 * 60 * 1000;
const MIN_OFFLINE_SIM_MS = 2000;
const MAX_OFFLINE_CYCLES_PER_BUSINESS = 12_000_000;

/**
 * Credit completed manager cycles between lastSavedAt and now (capped).
 * Mutates game.balance, game.lifetime, game.businesses[].runStartedAt, game.lastSavedAt.
 */
function applyOfflineDelta(game, nowMs) {
  const lastSaved = typeof game.lastSavedAt === "number" ? game.lastSavedAt : nowMs;
  let awayMs = nowMs - lastSaved;
  if (awayMs < 0) awayMs = 0;
  if (awayMs > MAX_OFFLINE_MS) awayMs = MAX_OFFLINE_MS;
  const simEnd = lastSaved + awayMs;

  let extraEarned = 0;

  if (awayMs >= MIN_OFFLINE_SIM_MS) {
    for (let i = 0; i < game.businesses.length; i++) {
      const bs = game.businesses[i];
      const def = BUSINESSES[i];
      if (!bs.hasManager || !bs.running || bs.runStartedAt == null) continue;
      if (isWorld2Locked(game, i)) continue;

      let cycleStart = bs.runStartedAt;
      const pu = game.purchasedUpgrades ?? [];
      const dur = getDur(def, bs, game.cafBoosts, pu);
      if (dur < 50) continue;

      const sb = 1;
      const profit = getProfit(def, bs, game.cafBoosts, sb, pu);
      const span = simEnd - cycleStart;
      if (span <= 0) {
        bs.runStartedAt = cycleStart;
        continue;
      }

      let nComplete = Math.floor(span / dur);
      if (nComplete > MAX_OFFLINE_CYCLES_PER_BUSINESS) nComplete = MAX_OFFLINE_CYCLES_PER_BUSINESS;

      if (nComplete > 0) {
        const gain = profit * nComplete;
        game.balance += gain;
        game.lifetime += gain;
        extraEarned += gain;
        cycleStart += nComplete * dur;
      }
      bs.runStartedAt = cycleStart;
    }
  }

  game.lastSavedAt = nowMs;
  return { awayMs, extraEarned, simEnd };
}
const fmtTime    = (ms) => {
  if (ms <= 0) return "0.0s";
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};
/** Short countdown for boost banners (whole seconds). */
function fmtRemainShort(ms) {
  if (ms <= 0) return "0s";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
const fmtShort   = (n) => {
  if (n >= 1e9) return `£${(n / 1e9).toFixed(1)}bn`;
  if (n >= 1e6) return `£${(n / 1e6).toFixed(1)}m`;
  if (n >= 1e3) return `£${(n / 1e3).toFixed(1)}k`;
  return fmt(n);
};

/** Automated income only (managers running), £ per second */
function computePoundsPerSecond(g) {
  let pps = 0;
  const sb = getSuperboostMult(g);
  const pu = g.purchasedUpgrades ?? [];
  g.businesses.forEach((bs, i) => {
    if (!bs.hasManager || !bs.running) return;
    if (isWorld2Locked(g, i)) return;
    const def = BUSINESSES[i];
    const dur = getDur(def, bs, g.cafBoosts, pu);
    if (dur <= 0) return;
    pps += (getProfit(def, bs, g.cafBoosts, sb, pu) / dur) * 1000;
  });
  return pps;
}

function fmtPerSec(pps) {
  if (!pps || pps < 0.005) return "£0.00/s";
  if (pps < 1000) return `£${pps.toFixed(2)}/s`;
  if (pps >= 1e9) return `${(pps / 1e9).toFixed(2)}bn/s`;
  if (pps >= 1e6) return `${(pps / 1e6).toFixed(2)}m/s`;
  if (pps >= 1e3) return `${(pps / 1e3).toFixed(2)}k/s`;
  return `${fmt(pps)}/s`;
}

// ─── PERSISTENT GAME STATE ───────────────────────────────────────────────────

function makeDefaultGame() {
  const t = Date.now();
  return {
    balance:       0,
    lifetime:      0,
    cafBoosts:     0,
    rebirthCount:  0,
    lastSavedAt:   t,
    bulkBuy:       1,
    lastCupPlayedAt: 0,
    superboost:     null,
    purchasedUpgrades: [],
    businesses: BUSINESSES.map(b => ({
      id: b.id, level: 1, hasManager: false,
      running: false, runStartedAt: null, readyToCollect: false,
    })),
  };
}

function migrateBusinessFromSaveV5(row, id) {
  return {
    id,
    level:      row?.level ?? 1,
    hasManager: row?.hasManager ?? false,
    running: false,
    runStartedAt: null,
    readyToCollect: false,
  };
}

function gameFromStoragePayload(p, now) {
  const sb =
    p.superboost &&
    typeof p.superboost.multiplier === "number" &&
    typeof p.superboost.expiresAt === "number"
      ? { multiplier: p.superboost.multiplier, expiresAt: p.superboost.expiresAt }
      : null;
  return {
    balance:      p.balance ?? 0,
    lifetime:     p.lifetime ?? 0,
    cafBoosts:    p.cafBoosts ?? 0,
    rebirthCount: p.rebirthCount ?? 0,
    lastSavedAt:  typeof p.lastSavedAt === "number" ? p.lastSavedAt : now,
    bulkBuy:
      p.bulkBuy === 10 || p.bulkBuy === 100 || p.bulkBuy === "max" ? p.bulkBuy : 1,
    lastCupPlayedAt: typeof p.lastCupPlayedAt === "number" ? p.lastCupPlayedAt : 0,
    superboost: sb,
    purchasedUpgrades: Array.isArray(p.purchasedUpgrades)
      ? p.purchasedUpgrades.filter((id) => typeof id === "string")
      : [],
    businesses: BUSINESSES.map((b, i) => {
      const s = p.businesses?.[i];
      if (!s) {
        return {
          id: b.id, level: 1, hasManager: false, running: false,
          runStartedAt: null, readyToCollect: false,
        };
      }
      return {
        id: b.id,
        level:      s.level ?? 1,
        hasManager: !!s.hasManager,
        running:       !!s.running,
        readyToCollect: !!s.readyToCollect,
        runStartedAt: typeof s.runStartedAt === "number" ? s.runStartedAt : null,
      };
    }),
  };
}

/** @returns {{ game: object, offline: { awayMs: number, extraEarned: number } }} */
function loadGame() {
  const now = Date.now();
  let game;
  let migratedFromOlder = false;

  try {
    const raw9 = localStorage.getItem(SAVE_KEY_V9);
    if (raw9) {
      game = gameFromStoragePayload(JSON.parse(raw9), now);
    } else {
      const raw8 = localStorage.getItem(SAVE_KEY_V8);
      if (raw8) {
        game = gameFromStoragePayload(JSON.parse(raw8), now);
        migratedFromOlder = true;
      } else {
        const raw7 = localStorage.getItem(SAVE_KEY_V7);
        if (raw7) {
          game = gameFromStoragePayload(JSON.parse(raw7), now);
          migratedFromOlder = true;
        } else {
          const raw6 = localStorage.getItem(SAVE_KEY_V6);
          if (raw6) {
            game = gameFromStoragePayload(JSON.parse(raw6), now);
            migratedFromOlder = true;
          } else {
            const raw5 = localStorage.getItem(SAVE_KEY_V5);
            if (raw5) {
              migratedFromOlder = true;
              const p = JSON.parse(raw5);
              game = {
                balance:      p.balance ?? 0,
                lifetime:     p.lifetime ?? 0,
                cafBoosts:    p.cafBoosts ?? 0,
                rebirthCount: p.rebirthCount ?? 0,
                lastSavedAt:  now,
                bulkBuy:      1,
                lastCupPlayedAt: 0,
                superboost:     null,
                purchasedUpgrades: [],
                businesses: BUSINESSES.map((b, i) => {
                  const row = p.businesses?.[i];
                  if (!row) {
                    return {
                      id: b.id, level: 1, hasManager: false, running: false,
                      runStartedAt: null, readyToCollect: false,
                    };
                  }
                  return migrateBusinessFromSaveV5(row, b.id);
                }),
              };
            } else {
              game = makeDefaultGame();
            }
          }
        }
      }
    }
  } catch {
    game = makeDefaultGame();
  }

  const offline = applyOfflineDelta(game, now);
  if (migratedFromOlder) saveGame(game);

  return { game, offline };
}

function saveGame(g) {
  try {
    const t = Date.now();
    g.lastSavedAt = t;
    localStorage.setItem(SAVE_KEY_V9, JSON.stringify({
      saveVersion: 9,
      lastSavedAt: t,
      bulkBuy: g.bulkBuy ?? 1,
      lastCupPlayedAt: typeof g.lastCupPlayedAt === "number" ? g.lastCupPlayedAt : 0,
      purchasedUpgrades: Array.isArray(g.purchasedUpgrades) ? g.purchasedUpgrades : [],
      superboost:
        g.superboost &&
        typeof g.superboost.multiplier === "number" &&
        typeof g.superboost.expiresAt === "number"
          ? { multiplier: g.superboost.multiplier, expiresAt: g.superboost.expiresAt }
          : null,
      balance:      g.balance,
      lifetime:     g.lifetime,
      cafBoosts:    g.cafBoosts,
      rebirthCount: g.rebirthCount,
      businesses: g.businesses.map(b => ({
        id: b.id,
        level: b.level,
        hasManager: b.hasManager,
        running: !!b.running,
        readyToCollect: !!b.readyToCollect,
        runStartedAt: typeof b.runStartedAt === "number" ? b.runStartedAt : null,
      })),
    }));
  } catch {}
}

let _floatId = 0;

// ─── REBIRTH MODAL ───────────────────────────────────────────────────────────

function RebirthModal({ game, onConfirm, onCancel }) {
  const earned    = boostsEarned(game.lifetime, game.rebirthCount);
  const newTotal  = game.cafBoosts + earned;
  const threshold = rebirthThreshold(game.rebirthCount);
  const canRebirth= game.lifetime >= threshold;
  const optimalReset =
    canRebirth && game.cafBoosts > 0 && earned >= game.cafBoosts;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "linear-gradient(145deg,#0e1c0c,#1a2c14)",
        border: "2px solid #3a6030",
        borderRadius: 18, padding: "24px 20px",
        maxWidth: 380, width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,.8), 0 0 40px rgba(92,184,92,.1)",
        position: "relative",
      }}>
        {/* Close */}
        <button onClick={onCancel} style={{
          position: "absolute", top: 12, right: 12,
          background: "none", border: "none", cursor: "pointer",
          color: "#4a6a44",
        }}>
          <X size={18} />
        </button>

        {/* Icon + title */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "linear-gradient(135deg,#1a3a28,#2e6040)",
            border: "3px solid #5cb85c",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 12px",
            boxShadow: "0 0 24px rgba(92,184,92,.3)",
          }}>
            <RefreshCw size={28} color="#8fdd9f" />
          </div>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#e8dcc8" }}>
            Workspace reset (caffeine index)
          </div>
          <div style={{ fontSize: 11, color: "#4a6a44", marginTop: 4 }}>
            Archive this session for permanent throughput multipliers (stacking parameters across runs)
          </div>
        </div>

        {optimalReset && (
          <div style={{
            background: "rgba(92,184,92,.12)", border: "1px solid #3a7030",
            borderRadius: 10, padding: "10px 12px", marginBottom: 14,
            fontSize: 11, color: "#a8d8a0", lineHeight: 1.45, fontWeight: 600,
          }}>
            <strong style={{ color: "#8fdd9f" }}>Favourable reset window:</strong> multipliers from this session ({earned}) meet or exceed your current index ({game.cafBoosts}). The next workspace will initialise with higher throughput.
          </div>
        )}

        {/* Can't rebirth yet */}
        {!canRebirth && (
          <div style={{
            background: "rgba(200,80,60,.1)", border: "1px solid #8a3020",
            borderRadius: 10, padding: "12px 14px", marginBottom: 16,
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <AlertTriangle size={16} color="#e07060" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 12, color: "#e07060", fontWeight: 700 }}>Insufficient cumulative revenue</div>
              <div style={{ fontSize: 11, color: "#7a4030", marginTop: 3 }}>
                You need {fmtShort(threshold)} cumulative revenue to execute a reset.<br />
                You have {fmtShort(game.lifetime)} recorded so far.
              </div>
              <div style={{ marginTop: 8, height: 6, background: "#1a0a08", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  width: `${Math.min(100, (game.lifetime / threshold) * 100)}%`,
                  background: "linear-gradient(90deg,#8a3020,#e07060)",
                  transition: "width .5s",
                }} />
              </div>
              <div style={{ fontSize: 10, color: "#5a2818", marginTop: 4, fontFamily: "monospace" }}>
                {((game.lifetime / threshold) * 100).toFixed(1)}% there
              </div>
            </div>
          </div>
        )}

        {/* Gains */}
        <div style={{
          background: "rgba(92,184,92,.06)", border: "1px solid #2a5020",
          borderRadius: 10, padding: "12px 14px", marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, color: "#4a7a40", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".08em" }}>
            ☕ You will GAIN
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Star size={14} color="#d4a843" />
            <span style={{ fontSize: 13, color: "#e8dcc8", fontWeight: 700 }}>
              +{earned} Caffeine Boost{earned !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#5a8050" }}>
            Total after reset: <span style={{ color: "#d4a843", fontWeight: 700 }}>{newTotal} ☕</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#4a7a40", lineHeight: 1.5 }}>
            Each boost stacks forever (global multiplier):<br />
            • <strong style={{ color: "#8fdd9f" }}>×{(1 + newTotal).toFixed(0)} profit</strong> on every business<br />
            • <strong style={{ color: "#8fdd9f" }}>+{(newTotal * 8).toFixed(0)}% speed</strong> on every run<br />
            <span style={{ color: "#5a7050", fontSize: 10 }}>
              Tip: retain automated supervisors so revenue accrues offline; tier thresholds (10, 25, 50…) on each unit yield large per-unit throughput adjustments.
            </span>
          </div>
        </div>

        {/* Losses */}
        <div style={{
          background: "rgba(200,80,60,.06)", border: "1px solid #3a1a10",
          borderRadius: 10, padding: "12px 14px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, color: "#7a3020", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>
            ⚠ You will LOSE
          </div>
          <div style={{ fontSize: 11, color: "#6a3a30", lineHeight: 1.6 }}>
            • All money ({fmt(game.balance)})<br />
            • All unit reference indices<br />
            • All managers
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "10px 0", borderRadius: 10,
            background: "#141c12", border: "1px solid #2a3a24",
            color: "#4a6a44", fontWeight: 700, fontSize: 13,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            Cancel
          </button>
          <button
            onClick={canRebirth ? onConfirm : undefined}
            disabled={!canRebirth}
            style={{
              flex: 2, padding: "10px 0", borderRadius: 10,
              background: canRebirth
                ? "linear-gradient(135deg,#2a5028,#5cb85c)"
                : "#1a2018",
              border: `1px solid ${canRebirth ? "#5cb85c" : "#2a3020"}`,
              color: canRebirth ? "#fff" : "#3a4a36",
              fontWeight: 800, fontSize: 13,
              cursor: canRebirth ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              boxShadow: canRebirth ? "0 0 16px rgba(92,184,92,.3)" : "none",
            }}
          >
            ☕ Execute reset
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LOCKED WORLD-2 ROW ──────────────────────────────────────────────────────

function LockedBusinessRow({ def, cafBoosts }) {
  const { Icon, color, darkColor } = def;
  const prog = Math.min(1, (cafBoosts ?? 0) / WORLD2_UNLOCK_CAFFEINE);
  return (
    <div style={{
      position: "relative",
      background: "linear-gradient(135deg,#1a2018,#141c12)",
      border: "2px solid #243020",
      borderRadius: 12, marginBottom: 8, overflow: "hidden",
      minHeight: 108,
      boxShadow: "0 2px 8px rgba(0,0,0,.4)",
    }}>
      <div style={{ display: "flex", alignItems: "stretch", minHeight: 76, position: "relative", zIndex: 1 }}>
        <div style={{
          width: 78, minWidth: 78, flexShrink: 0,
          background: `linear-gradient(135deg,${darkColor},${color})`,
          opacity: 0.35, borderRight: `3px solid ${darkColor}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={22} color="rgba(255,255,255,.35)" strokeWidth={2} />
        </div>
        <div style={{ flex: 1, padding: "10px 10px 8px", display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 12, color: "#5a5a52" }}>{def.name}</span>
          </div>
          <div style={{ fontSize: 10, color: "#6a6a5e", marginTop: 4 }}>
            Unlocks at ☕×{WORLD2_UNLOCK_CAFFEINE}
          </div>
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 6, background: "#060c05", borderRadius: 3, overflow: "hidden", border: "1px solid #1e2e1a" }}>
              <div style={{
                height: "100%", width: `${prog * 100}%`,
                background: "linear-gradient(90deg,#5a4a20,#d4a843)",
                borderRadius: 3, transition: "width .25s ease",
              }} />
            </div>
            <div style={{ fontSize: 8, color: "#4a5046", marginTop: 3, fontFamily: "monospace" }}>
              {cafBoosts ?? 0} / {WORLD2_UNLOCK_CAFFEINE}
            </div>
          </div>
        </div>
      </div>
      <div style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,.5)",
        zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none",
      }}>
        <Lock size={34} color="#c8b8a0" strokeWidth={2.4} />
      </div>
    </div>
  );
}

const CUP_LOGO_SRC = `${import.meta.env.BASE_URL}flat-whites-cup-logo.png`;

// ─── MR WHITE'S CUP MINIGAME ─────────────────────────────────────────────────

function CupMinigame({ lastCupPlayedAt, superboost, onSessionEnd }) {
  const [phase, setPhase] = useState("idle");
  const [fillLevel, setFillLevel] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [bounceTick, setBounceTick] = useState(0);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const fillRef = useRef(0);
  const onSessionEndRef = useRef(onSessionEnd);
  onSessionEndRef.current = onSessionEnd;

  const canStart =
    !lastCupPlayedAt || Date.now() - lastCupPlayedAt >= CUP_COOLDOWN_MS;
  const cooldownLeft =
    lastCupPlayedAt > 0
      ? Math.max(0, CUP_COOLDOWN_MS - (Date.now() - lastCupPlayedAt))
      : 0;

  const [, cdBump] = useState(0);
  useEffect(() => {
    if (canStart && phase === "idle") return;
    if (phase === "active") return;
    const id = window.setInterval(() => cdBump((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [canStart, phase, lastCupPlayedAt]);

  const sb =
    superboost &&
    typeof superboost.expiresAt === "number" &&
    typeof superboost.multiplier === "number" &&
    Date.now() < superboost.expiresAt
      ? superboost
      : null;
  const sbLeft = sb ? Math.max(0, sb.expiresAt - Date.now()) : 0;

  useEffect(() => {
    if (phase !== "active") return;

    const gameStart = Date.now();
    const samples = [];
    fillRef.current = 0;
    setFillLevel(0);
    setTimeLeft(30);
    samples.push(fillRef.current);

    let drainId;
    let sampleId;
    let countId;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearInterval(drainId);
      window.clearInterval(sampleId);
      window.clearInterval(countId);
      const avg = samples.length
        ? samples.reduce((a, b) => a + b, 0) / samples.length
        : 0;
      setPhase("idle");
      fillRef.current = 0;
      setFillLevel(0);
      onSessionEndRef.current(avg);
    };

    drainId = window.setInterval(() => {
      const elapsed = Date.now() - gameStart;
      if (elapsed >= CUP_GAME_MS) {
        finish();
        return;
      }
      fillRef.current = Math.max(0, fillRef.current - 3);
      setFillLevel(fillRef.current);
    }, 100);

    sampleId = window.setInterval(() => {
      samples.push(fillRef.current);
    }, 500);

    countId = window.setInterval(() => {
      const rem = CUP_GAME_MS - (Date.now() - gameStart);
      setTimeLeft(Math.max(0, Math.ceil(rem / 1000)));
    }, 1000);

    return () => {
      window.clearInterval(drainId);
      window.clearInterval(sampleId);
      window.clearInterval(countId);
    };
  }, [phase]);

  const onCupClick = (e) => {
    e.preventDefault();
    if (phase === "active") {
      fillRef.current = Math.min(100, fillRef.current + 8);
      setFillLevel(fillRef.current);
      setBounceTick((t) => t + 1);
      return;
    }
    if (phase === "idle" && canStart) setPhase("active");
  };

  const cupIdleReady = phase === "idle" && canStart;
  const cupGreyCooldown = phase === "idle" && !canStart;
  const cupActive = phase === "active";

  return (
    <div style={{
      width: 140, maxWidth: "100%", margin: "0 auto",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            disabled={cupGreyCooldown}
            onClick={onCupClick}
            aria-label="Sampling control: initialise or append measurement to the throughput calibration module"
            style={{
              background: "transparent", border: "none", padding: 0, cursor: cupGreyCooldown ? "not-allowed" : "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              filter: cupGreyCooldown ? "grayscale(1) brightness(.55)" : "none",
            }}
          >
            {logoLoadFailed ? (
              cupActive ? (
                <span
                  key={bounceTick}
                  style={{ display: "inline-block", animation: "cupBounce 0.14s ease-out" }}
                >
                  <Coffee
                    size={72}
                    color="#fff8e8"
                    strokeWidth={2.4}
                    style={{ display: "block", filter: "drop-shadow(0 0 8px rgba(255,220,160,.9))" }}
                  />
                </span>
              ) : (
                <Coffee
                  size={72}
                  color={cupGreyCooldown ? "#6a6a60" : "#f4e4b8"}
                  strokeWidth={2}
                  style={{
                    display: "block",
                    animation: cupIdleReady ? "cupGlow 1.6s ease-in-out infinite" : "none",
                    filter: cupIdleReady ? "drop-shadow(0 0 10px rgba(255,200,100,.75))" : "none",
                  }}
                />
              )
            ) : cupActive ? (
              <span
                key={bounceTick}
                style={{ display: "inline-block", animation: "cupBounce 0.14s ease-out" }}
              >
                <img
                  src={CUP_LOGO_SRC}
                  alt="Flat White's Bishopton Brew"
                  width={72}
                  height={72}
                  draggable={false}
                  onError={() => setLogoLoadFailed(true)}
                  style={{
                    display: "block",
                    width: 72,
                    height: 72,
                    objectFit: "contain",
                    borderRadius: "50%",
                    userSelect: "none",
                    pointerEvents: "none",
                    filter: "drop-shadow(0 0 8px rgba(255,220,160,.9))",
                  }}
                />
              </span>
            ) : (
              <img
                src={CUP_LOGO_SRC}
                alt="Flat White's Bishopton Brew"
                width={72}
                height={72}
                draggable={false}
                onError={() => setLogoLoadFailed(true)}
                style={{
                  display: "block",
                  width: 72,
                  height: 72,
                  objectFit: "contain",
                  borderRadius: "50%",
                  userSelect: "none",
                  pointerEvents: "none",
                  animation: cupIdleReady ? "cupGlow 1.6s ease-in-out infinite" : "none",
                  filter: cupIdleReady ? "drop-shadow(0 0 10px rgba(255,200,100,.75))" : "none",
                }}
              />
            )}
          </button>
          {cupIdleReady && (
            <span style={{ fontSize: 9, fontWeight: 800, color: "#d4a843", letterSpacing: ".06em" }}>Initialise</span>
          )}
          {cupGreyCooldown && (
            <span style={{ fontSize: 8, fontWeight: 700, color: "#6a7066", textAlign: "center", lineHeight: 1.25, maxWidth: 120 }}>
              Ready in {fmtRemainShort(cooldownLeft)}
            </span>
          )}
        </div>
        <div style={{
          width: 28, height: 200, background: "#060c05", borderRadius: 8,
          border: "1px solid #1e2e1a", position: "relative", overflow: "hidden", flexShrink: 0,
        }}>
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: `${fillLevel}%`,
            background: cupActive
              ? "linear-gradient(180deg,#ffe8a0,#d4a020)"
              : "linear-gradient(180deg,#c07800,#6a4010)",
            borderRadius: "0 0 6px 6px",
            transition: "height 0.08s linear",
          }} />
        </div>
      </div>
      {cupActive && (
        <div style={{ fontSize: 11, fontWeight: 800, color: "#e8dcc8", textAlign: "center", width: "100%" }}>
          {timeLeft}s
        </div>
      )}

      {sb && (
        <div style={{
          fontSize: 9, fontWeight: 800, color: "#f0c040", textAlign: "center",
          lineHeight: 1.3, animation: "superSbPulse 1.4s ease-in-out infinite",
          padding: "4px 6px", borderRadius: 8,
          background: "rgba(80,60,10,.35)", border: "1px solid #8a7020", maxWidth: "100%",
        }}>
          ☕ ×{sb.multiplier} BOOST — {fmtRemainShort(sbLeft)} remaining
        </div>
      )}
    </div>
  );
}

function ShopPanel({ isOpen, onClose, purchasedUpgrades, balance, businesses, onBuy }) {
  const pu = purchasedUpgrades ?? [];
  return (
    <>
      <div
        className={`shop-backdrop${isOpen ? " shop-backdrop-on" : ""}`}
        onClick={isOpen ? onClose : undefined}
        aria-hidden={!isOpen}
      />
      <aside className={`shop-panel${isOpen ? " shop-panel-on" : ""}`}>
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px", borderBottom: "1px solid #1e3018",
        }}>
          <span style={{ fontWeight: 900, fontSize: 13, color: "#e8dcc8", letterSpacing: ".02em" }}>
            ☕ Mr White&apos;s Shop
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#141c12", border: "1px solid #2a3a26", borderRadius: 8, padding: 6,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
            aria-label="Close shop"
          >
            <X size={18} color="#9ab0a0" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 28px" }}>
          {SHOP_SECTIONS.map((sec) => (
            <div key={sec.title} style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 10, fontWeight: 800, color: "#5cb85c", textTransform: "uppercase",
                letterSpacing: ".1em", marginBottom: 8, paddingLeft: 2,
              }}>
                {sec.title}
              </div>
              {sec.ids.map((id) => {
                const u = UPGRADES.find((x) => x.id === id);
                if (!u) return null;
                const Ico = u.icon;
                const owned = pu.includes(u.id);
                const tLevel = shopTargetLevel(businesses, u.target);
                const lockedReq = u.requiresLevel != null && tLevel < u.requiresLevel;
                const canAfford = balance >= u.cost;
                return (
                  <div
                    key={u.id}
                    style={{
                      position: "relative",
                      background: "linear-gradient(135deg,#141c12,#0f160e)",
                      border: "1px solid #1e2e1a",
                      borderRadius: 10,
                      padding: "8px 10px",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6, background: "#0a1008",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        border: "1px solid #243020",
                      }}>
                        <Ico size={14} color="#b0c8a8" strokeWidth={2.2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 11, color: "#e8dcc8", lineHeight: 1.25 }}>
                          {u.name}
                        </div>
                        <div style={{ fontSize: 9, color: "#5a6a56", marginTop: 3, lineHeight: 1.35 }}>
                          {u.description}
                        </div>
                        <div style={{ fontSize: 10, fontFamily: "monospace", color: "#8fdd9f", marginTop: 5, fontWeight: 600 }}>
                          {fmt(u.cost)}
                        </div>
                      </div>
                    </div>
                    {owned ? (
                      <div style={{
                        marginTop: 8, fontSize: 9, fontWeight: 800, color: "#5cb85c",
                        textAlign: "center", padding: "4px 0",
                      }}>
                        ✓ Owned
                      </div>
                    ) : lockedReq ? (
                      <div style={{
                        position: "absolute", inset: 0, borderRadius: 10, background: "rgba(0,0,0,.55)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexDirection: "column", gap: 4,
                      }}>
                        <Lock size={20} color="#a89880" />
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#c8b8a0" }}>
                          Requires Lv {u.requiresLevel}
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onBuy(u.id)}
                        style={{
                          marginTop: 8, width: "100%", padding: "6px 0", borderRadius: 8,
                          border: `2px solid ${canAfford ? "#5cb85c" : "#2a3028"}`,
                          background: canAfford ? "linear-gradient(135deg,#2a5028,#3a6c34)" : "#141a12",
                          color: canAfford ? "#e8fcc8" : "#3a4038",
                          fontWeight: 800, fontSize: 11, cursor: canAfford ? "pointer" : "not-allowed",
                          fontFamily: "inherit",
                        }}
                      >
                        Procure
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

// ─── BUSINESS ROW ─────────────────────────────────────────────────────────────

function BusinessRow({ def, bsSnap, balance, cafBoosts, superboostMult = 1, purchasedUpgrades = [], bulkBuy, barRef, btnRef, timerRef, onAction, onUpgrade, onHireManager }) {
  const { Icon, color, darkColor } = def;
  const maxN   = countAffordFromBalance(balance, def, bsSnap.level);
  const nBuy   = bulkBuy === "max" ? maxN : Math.min(bulkBuy, maxN);
  const totalCost = nBuy > 0 ? sumUpgradeCostN(def, bsSnap.level, nBuy) : getUpgCost(def, bsSnap);
  const canUpg = nBuy > 0 && balance >= totalCost;
  const canHire = balance >= def.managerCost;
  const dur     = getDur(def, bsSnap, cafBoosts, purchasedUpgrades);
  const profit  = getProfit(def, bsSnap, cafBoosts, superboostMult, purchasedUpgrades);
  const mc      = milestoneCount(bsSnap.level);
  const nextLv  = nextMilestoneLevel(bsSnap.level);
  const mProf     = milestoneProfitMult(bsSnap.level);
  const mSpd      = milestoneSpeedMult(bsSnap.level);
  const bizPps    = bsSnap.hasManager && bsSnap.running ? (profit / dur) * 1000 : 0;
  const upgradeSafe = balance > 0 && totalCost <= balance * 0.01 && nBuy === 1;

  return (
    <div style={{
      background: bsSnap.hasManager
        ? "linear-gradient(135deg,#1e2a1a,#2a2010)"
        : "linear-gradient(135deg,#1a2018,#141c12)",
      border: `2px solid ${bsSnap.hasManager ? "#8a6a10" : "#243020"}`,
      borderRadius: 12, marginBottom: 8, overflow: "hidden",
      boxShadow: bsSnap.hasManager ? "0 2px 12px rgba(212,168,67,.15)" : "0 2px 8px rgba(0,0,0,.4)",
    }}>
      <div style={{ display: "flex", alignItems: "stretch", minHeight: 76 }}>

        {/* Left action button */}
        <button
          ref={btnRef}
          onClick={(e) => onAction(def.id, e)}
          style={{
            width: 78, minWidth: 78, flexShrink: 0,
            background: `linear-gradient(135deg,${darkColor},${color})`,
            border: "none", borderRight: `3px solid ${darkColor}`,
            cursor: "pointer", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 4,
            position: "relative", overflow: "hidden",
          }}
        >
          <div style={{
            width: 38, height: 38, background: "rgba(0,0,0,.28)",
            borderRadius: "50%", display: "flex", alignItems: "center",
            justifyContent: "center", border: "2px solid rgba(255,255,255,.22)",
          }}>
            <Icon size={18} color="#fff" strokeWidth={2.2} />
          </div>
          <span style={{
            fontSize: 9, fontWeight: 800, color: "#fff",
            textTransform: "uppercase", letterSpacing: ".05em",
            textAlign: "center", lineHeight: 1.2, padding: "0 4px",
            pointerEvents: "none",
          }}>
            {bsSnap.readyToCollect ? "Load output" : bsSnap.running ? "Executing" : "Initialize"}
          </span>
        </button>

        {/* Middle */}
        <div style={{ flex: 1, padding: "10px 10px 8px", display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
          {/* Name + badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 12, color: "#e8dcc8" }}>{def.shortName}</span>
            <span style={{
              background: `${color}28`, border: `1px solid ${color}70`,
              borderRadius: 999, padding: "1px 6px",
              fontSize: 9, fontWeight: 700, color, fontFamily: "monospace",
            }}>REF {bsSnap.level}</span>
            {mc > 0 && (
              <span style={{
                background: "rgba(143,221,159,.12)", border: "1px solid #3a6040",
                borderRadius: 999, padding: "1px 6px",
                fontSize: 9, fontWeight: 700, color: "#8fdd9f",
                display: "flex", alignItems: "center", gap: 3,
              }}>
                <Flag size={8} color="#8fdd9f" /> {mc}× tiers
              </span>
            )}
            {bsSnap.hasManager && (
              <span style={{
                background: "rgba(212,168,67,.15)", border: "1px solid #a07c2a",
                borderRadius: 999, padding: "1px 6px",
                fontSize: 9, fontWeight: 700, color: "#d4a843",
                display: "flex", alignItems: "center", gap: 3,
              }}>
                <Zap size={8} color="#d4a843" /> AUTO
              </span>
            )}
            {cafBoosts > 0 && (
              <span style={{
                background: "rgba(180,120,60,.15)", border: "1px solid #7a5020",
                borderRadius: 999, padding: "1px 6px",
                fontSize: 9, fontWeight: 700, color: "#d4a843",
              }}>
                ☕×{cafBoosts}
              </span>
            )}
          </div>

          {/* Progress bar — DOM ref driven */}
          <div style={{ position: "relative", marginTop: 5 }}>
            <div style={{
              height: 20, background: "#060c05", borderRadius: 5,
              overflow: "hidden", border: "1px solid #1e2e1a", position: "relative",
            }}>
              <div
                ref={barRef}
                style={{
                  height: "100%", width: "0%",
                  background: `linear-gradient(90deg,${darkColor},${color})`,
                  borderRadius: 4, position: "relative", overflow: "hidden",
                  willChange: "width",
                }}
              >
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(90deg,transparent 0%,rgba(255,255,255,.2) 50%,transparent 100%)",
                  animation: "shimmer 1.1s infinite",
                }} />
              </div>
              {[25, 50, 75].map(p => (
                <div key={p} style={{
                  position: "absolute", top: 0, bottom: 0, left: `${p}%`,
                  width: 1, background: "rgba(0,0,0,.4)", pointerEvents: "none",
                }} />
              ))}
            </div>
          </div>

          {/* Profit + timer + tier thresholds */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "#6aab7a", fontFamily: "monospace", fontWeight: 600 }}>
              {fmt(profit)}/run
              {bizPps > 0 && (
                <span style={{ color: "#d4a843", marginLeft: 6 }}>({fmtPerSec(bizPps)} auto)</span>
              )}
            </span>
            <span ref={timerRef} style={{ fontSize: 10, fontFamily: "monospace", color: "#6a7a66" }}>
              {fmtTime(dur)}
            </span>
          </div>
          <div style={{
            marginTop: 5, fontSize: 8, color: "#4a5a46", lineHeight: 1.35,
            display: "flex", flexWrap: "wrap", gap: "4px 8px", alignItems: "center",
          }}>
            <span>
              Tier bands: <strong style={{ color: "#7aab80" }}>×{mProf.toFixed(2)}</strong> profit ·{" "}
              <strong style={{ color: "#7aab80" }}>×{mSpd.toFixed(2)}</strong> speed (this unit)
            </span>
            {nextLv != null ? (
              <span style={{ color: "#6a6048" }}>
                Next threshold at <strong style={{ color: "#d4a843" }}>REF {nextLv}</strong>
              </span>
            ) : (
              <span style={{ color: "#5cb85c", fontWeight: 700 }}>All tier thresholds applied</span>
            )}
            {upgradeSafe && canUpg && (
              <span style={{ color: "#3a5a40", fontStyle: "italic" }}>Cheap upgrade (&lt;1% cash)</span>
            )}
          </div>
        </div>

        {/* Right buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 8px 8px 4px", justifyContent: "center", minWidth: 105 }}>
          <button
            onClick={() => onUpgrade(def.id)}
            disabled={!canUpg}
            style={{
              background: canUpg ? "linear-gradient(135deg,#2a4028,#3a5c34)" : "#141c12",
              border: `1px solid ${canUpg ? "#5cb85c" : "#1e2a1a"}`,
              borderRadius: 7, padding: "5px 8px", cursor: canUpg ? "pointer" : "not-allowed",
              opacity: canUpg ? 1 : 0.38, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              fontFamily: "inherit",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <TrendingUp size={10} color="#8fdd9f" />
              <span style={{ fontSize: 8, fontWeight: 800, color: "#8fdd9f", textTransform: "uppercase", letterSpacing: ".05em" }}>Increment</span>
            </div>
            <span style={{ fontSize: 9, fontFamily: "monospace", color: canUpg ? "#c0e0b8" : "#3a4e36", fontWeight: 600 }}>
              {nBuy > 1 ? `${fmt(totalCost)} · ×${nBuy}` : fmt(totalCost)}
            </span>
          </button>

          {bsSnap.hasManager ? (
            <div style={{
              background: "rgba(212,168,67,.08)", border: "1px solid #7a5c18",
              borderRadius: 7, padding: "5px 8px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <UserCheck size={10} color="#d4a843" />
                <span style={{ fontSize: 8, fontWeight: 800, color: "#d4a843", textTransform: "uppercase" }}>Managed</span>
              </div>
              <span style={{ fontSize: 8, color: "#7a6020", fontFamily: "monospace" }}>on shift</span>
            </div>
          ) : (
            <button
              onClick={() => onHireManager(def.id)}
              disabled={!canHire}
              style={{
                background: canHire ? "linear-gradient(135deg,#2a2010,#3a3018)" : "#141008",
                border: `1px solid ${canHire ? "#a07c2a" : "#1e1808"}`,
                borderRadius: 7, padding: "5px 8px", cursor: canHire ? "pointer" : "not-allowed",
                opacity: canHire ? 1 : 0.38, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Users size={10} color="#d4a843" />
                <span style={{ fontSize: 8, fontWeight: 800, color: "#d4a843", textTransform: "uppercase" }}>Manager</span>
              </div>
              <span style={{ fontSize: 9, fontFamily: "monospace", color: canHire ? "#b8942a" : "#3a2e10", fontWeight: 600 }}>
                {fmt(def.managerCost)}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20, zIndex: 300,
      background: "#1a2e16", border: "1px solid #5cb85c",
      borderRadius: 10, padding: "10px 16px",
      color: "#c8e8c0", fontSize: 13, fontWeight: 700,
      boxShadow: "0 4px 20px rgba(0,0,0,.7)",
      maxWidth: 280, animation: "slideIn .3s ease",
    }}>{msg}</div>
  );
}

function FloatLabels({ labels }) {
  return labels.map(l => (
    <div key={l.id} style={{
      position: "fixed", left: l.x, top: l.y, pointerEvents: "none",
      zIndex: 9999, color: "#8fdd9f", fontFamily: "monospace",
      fontSize: 15, fontWeight: 700, animation: "floatUp 1s ease-out forwards",
      textShadow: "0 0 10px rgba(143,221,159,.7)",
    }}>+{l.text}</div>
  ));
}

// ─── APP ─────────────────────────────────────────────────────────────────────

let __initialLoad = null;
function getInitialLoad() {
  if (__initialLoad == null) __initialLoad = loadGame();
  return __initialLoad;
}

export default function App() {
  const il = getInitialLoad();
  const gameRef = useRef(il.game);
  const offlineBootRef = useRef(il.offline);

  const [uiSnap,       setUiSnap]       = useState(() => snap(gameRef.current));
  const [toast,        setToast]        = useState(null);
  const [floats,       setFloats]       = useState([]);
  const [showRebirth,  setShowRebirth]  = useState(false);
  const [showShop, setShowShop] = useState(false);

  const toastTimer  = useRef(null);
  const rafRef      = useRef(null);
  const lastSaveRef = useRef(Date.now());
  const pendingUI   = useRef(false);

  // DOM refs
  const barRefs   = useRef(BUSINESSES.map(() => ({ current: null })));
  const btnRefs   = useRef(BUSINESSES.map(() => ({ current: null })));
  const timerRefs = useRef(BUSINESSES.map(() => ({ current: null })));

  function snap(g) {
    const sb = g.superboost &&
      typeof g.superboost.expiresAt === "number" &&
      typeof g.superboost.multiplier === "number"
      ? { multiplier: g.superboost.multiplier, expiresAt: g.superboost.expiresAt }
      : null;
    return {
      balance:      g.balance,
      lifetime:     g.lifetime,
      cafBoosts:    g.cafBoosts,
      rebirthCount: g.rebirthCount,
      bulkBuy:      g.bulkBuy ?? 1,
      lastCupPlayedAt: typeof g.lastCupPlayedAt === "number" ? g.lastCupPlayedAt : 0,
      superboost: sb,
      superboostMult: getSuperboostMult(g),
      purchasedUpgrades: Array.isArray(g.purchasedUpgrades) ? [...g.purchasedUpgrades] : [],
      businesses:   g.businesses.map(b => ({ ...b })),
    };
  }

  const scheduleUI = useCallback(() => {
    if (pendingUI.current) return;
    pendingUI.current = true;
    Promise.resolve().then(() => {
      setUiSnap(snap(gameRef.current));
      pendingUI.current = false;
    });
  }, []);

  const handleCupComplete = useCallback((avgPct) => {
    const g = gameRef.current;
    const { mult, durMs } = tierFromAvgCupFill(avgPct);
    g.superboost = { multiplier: mult, expiresAt: Date.now() + durMs };
    g.lastCupPlayedAt = Date.now();
    saveGame(g);
    scheduleUI();
  }, [scheduleUI]);

  useEffect(() => {
    if (uiSnap.superboostMult <= 1) return;
    const id = window.setInterval(() => scheduleUI(), 1000);
    return () => window.clearInterval(id);
  }, [uiSnap.superboostMult, scheduleUI]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const o = offlineBootRef.current;
    if (o.extraEarned > 0 && o.awayMs >= MIN_OFFLINE_SIM_MS) {
      const h = Math.floor(o.awayMs / 3600000);
      const m = Math.floor((o.awayMs % 3600000) / 60000);
      const timeBit = h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
      showToast(`Back after ~${timeBit}: your managers banked ${fmt(o.extraEarned)} while you were away.`);
    }
  }, [showToast]);

  const spawnFloat = useCallback((e, text) => {
    const id = _floatId++;
    setFloats(f => [...f, { id, x: e.clientX - 30, y: e.clientY - 10, text }]);
    setTimeout(() => setFloats(f => f.filter(l => l.id !== id)), 1000);
  }, []);

  // DOM bar painters
  const paintBar = useCallback((i, progress, isReady) => {
    const el = barRefs.current[i]?.current;
    if (!el) return;
    const def = BUSINESSES[i];
    el.style.width = `${Math.min(100, progress * 100)}%`;
    el.style.background = isReady
      ? "linear-gradient(90deg,#c07800,#ffd040)"
      : `linear-gradient(90deg,${def.darkColor},${def.color})`;
    el.style.boxShadow = isReady ? "0 0 8px rgba(255,200,0,.6)" : "none";
  }, []);

  const paintTimer = useCallback((i, remaining, isReady) => {
    const el = timerRefs.current[i]?.current;
    if (!el) return;
    if (isReady) {
      el.textContent = "✓ Complete";
      el.style.color = "#ffd040";
      el.style.fontWeight = "700";
    } else {
      el.textContent = fmtTime(Math.max(0, remaining));
      el.style.color = "#6a7a66";
      el.style.fontWeight = "400";
    }
  }, []);

  const paintBtn = useCallback((i, bs) => {
    const btn = btnRefs.current[i]?.current;
    if (!btn) return;
    const def   = BUSINESSES[i];
    const label = btn.querySelector("span");
    if (bs.readyToCollect) {
      btn.style.background = "linear-gradient(135deg,#c07800,#f0a800)";
      btn.style.cursor     = "pointer";
      if (label) label.textContent = "Load output";
    } else if (bs.running) {
      btn.style.background = `linear-gradient(135deg,${def.darkColor},${def.color})`;
      btn.style.cursor     = "default";
      if (label) label.textContent = "Executing";
    } else {
      btn.style.background = `linear-gradient(135deg,${def.darkColor},${def.color})`;
      btn.style.cursor     = "pointer";
      if (label) label.textContent = "Initialize";
    }
  }, []);

  // ── GAME LOOP ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = () => {
      const now = Date.now();
      const g = gameRef.current;
      let uiChanged = false;

      g.businesses.forEach((bs, i) => {
        const def = BUSINESSES[i];
        if (isWorld2Locked(g, i)) {
          paintBar(i, bs.readyToCollect ? 1 : 0, bs.readyToCollect);
          if (bs.readyToCollect) paintTimer(i, 0, true);
          else paintTimer(i, 0, false);
          return;
        }
        if (!bs.running) {
          paintBar(i, bs.readyToCollect ? 1 : 0, bs.readyToCollect);
          return;
        }
        if (bs.runStartedAt == null) {
          bs.runStartedAt = now;
          return;
        }
        const pu = g.purchasedUpgrades ?? [];
        const dur      = getDur(def, bs, g.cafBoosts, pu);
        const elapsed  = now - bs.runStartedAt;
        const progress = Math.min(1, elapsed / dur);

        paintBar(i, progress, false);
        paintTimer(i, dur - elapsed, false);

        if (progress >= 1) {
          if (bs.hasManager) {
            const sb = getSuperboostMult(g);
            const p = getProfit(def, bs, g.cafBoosts, sb, pu);
            g.balance  += p;
            g.lifetime += p;
            bs.runStartedAt = now;
            paintBar(i, 0, false);
            uiChanged = true;
          } else {
            bs.running        = false;
            bs.readyToCollect = true;
            bs.runStartedAt    = null;
            paintBar(i, 1, true);
            paintTimer(i, 0, true);
            paintBtn(i, bs);
            uiChanged = true;
          }
        }
      });

      if (uiChanged) scheduleUI();

      if (now - lastSaveRef.current > 5000) {
        saveGame(g);
        lastSaveRef.current = now;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paintBar, paintTimer, paintBtn, scheduleUI]);

  // Auto-start managed on mount (do not clobber saved run timing)
  useEffect(() => {
    const now = Date.now();
    gameRef.current.businesses.forEach((bs, i) => {
      if (isWorld2Locked(gameRef.current, i)) return;
      if (!bs.hasManager || bs.readyToCollect) return;
      if (!bs.running) {
        bs.running = true;
        bs.runStartedAt = now;
      } else if (bs.runStartedAt == null) {
        bs.runStartedAt = now;
      }
    });
    scheduleUI();
  }, [scheduleUI]);

  // Heartbeat + flush save when tab hides / closes
  useEffect(() => {
    const flush = () => saveGame(gameRef.current);
    const hb = window.setInterval(flush, 30000);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.clearInterval(hb);
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  // ── ACTIONS ───────────────────────────────────────────────────────────────
  const handleAction = useCallback((id, e) => {
    const g   = gameRef.current;
    const i   = BUSINESSES.findIndex(d => d.id === id);
    const bs  = g.businesses[i];
    const def = BUSINESSES[i];
    if (isWorld2Locked(g, i)) return;

    const pu = g.purchasedUpgrades ?? [];
    if (bs.readyToCollect) {
      const profit   = getProfit(def, bs, g.cafBoosts, getSuperboostMult(g), pu);
      g.balance     += profit;
      g.lifetime    += profit;
      bs.readyToCollect = false;
      bs.running        = false;
      bs.runStartedAt    = null;
      spawnFloat(e, fmt(profit));
      paintBar(i, 0, false);
      paintTimer(i, getDur(def, bs, g.cafBoosts, pu), false);
      paintBtn(i, bs);
      scheduleUI();
    } else if (!bs.running) {
      bs.running       = true;
      bs.runStartedAt  = Date.now();
      paintBtn(i, bs);
      scheduleUI();
    }
  }, [spawnFloat, paintBar, paintTimer, paintBtn, scheduleUI]);

  const handleUpgrade = useCallback((id) => {
    const g   = gameRef.current;
    const i   = BUSINESSES.findIndex(d => d.id === id);
    if (isWorld2Locked(g, i)) return;
    const bs  = g.businesses[i];
    const def = BUSINESSES[i];
    const mode = g.bulkBuy ?? 1;
    const maxN = countAffordFromBalance(g.balance, def, bs.level);
    const n    = mode === "max" ? maxN : Math.min(mode, maxN);
    const pu = g.purchasedUpgrades ?? [];
    if (n < 1) return;

    const prevLevel = bs.level;
    const prevM     = milestoneCount(prevLevel);
    const costSum   = sumUpgradeCostN(def, bs.level, n);
    g.balance -= costSum;
    bs.level  += n;
    const newM = milestoneCount(bs.level);
    if (newM > prevM) {
      showToast(`Threshold event: ${def.shortName} — large profit and latency adjustment on this unit`);
    } else if (n > 1) {
      showToast(`⬆ ${def.shortName} +${n} indices → REF ${bs.level}`);
    } else {
      showToast(`⬆ ${def.shortName} → REF ${bs.level}! Cycle ${(getDur(def, bs, g.cafBoosts, pu) / 1000).toFixed(1)}s`);
    }
    scheduleUI();
  }, [showToast, scheduleUI]);

  const setBulkBuy = useCallback((v) => {
    gameRef.current.bulkBuy = v;
    saveGame(gameRef.current);
    scheduleUI();
  }, [scheduleUI]);

  const handleHireManager = useCallback((id) => {
    const g   = gameRef.current;
    const i   = BUSINESSES.findIndex(d => d.id === id);
    if (isWorld2Locked(g, i)) return;
    const bs  = g.businesses[i];
    const def = BUSINESSES[i];
    if (bs.hasManager) return;
    if (g.balance < def.managerCost) { showToast(`Not enough to hire ${def.managerName}.`); return; }
    g.balance    -= def.managerCost;
    bs.hasManager = true;
    bs.running    = true;
    bs.runStartedAt = Date.now();
    paintBtn(i, bs);
    showToast(`🤵 ${def.managerName} is now on shift!`);
    scheduleUI();
  }, [showToast, paintBtn, scheduleUI]);

  const handleBuyUpgrade = useCallback((upgradeId) => {
    const g = gameRef.current;
    const upg = UPGRADES.find((u) => u.id === upgradeId);
    if (!upg || (g.purchasedUpgrades ?? []).includes(upgradeId)) return;
    if (g.balance < upg.cost) return;
    g.balance -= upg.cost;
    g.purchasedUpgrades = [...(g.purchasedUpgrades ?? []), upgradeId];
    showToast(`✓ ${upg.name} purchased!`);
    saveGame(g);
    scheduleUI();
  }, [showToast, scheduleUI]);

  // ── REBIRTH ───────────────────────────────────────────────────────────────
  const handleRebirth = useCallback(() => {
    const g = gameRef.current;
    const earned = boostsEarned(g.lifetime, g.rebirthCount);

    // Apply boosts
    g.cafBoosts    += earned;
    g.rebirthCount += 1;

    // Reset businesses and economy
    g.balance  = 0;
    g.lifetime = 0;
    g.businesses = BUSINESSES.map(b => ({
      id: b.id, level: 1, hasManager: false,
      running: false, runStartedAt: null, readyToCollect: false,
    }));

    const pu = g.purchasedUpgrades ?? [];
    // Reset all bar DOMs
    BUSINESSES.forEach((_, i) => {
      paintBar(i, 0, false);
      paintTimer(i, getDur(BUSINESSES[i], g.businesses[i], g.cafBoosts, pu), false);
      paintBtn(i, g.businesses[i]);
    });

    saveGame(g);
    setShowRebirth(false);
    showToast(`☕ Workspace reset complete. Caffeine index now ${g.cafBoosts}. Global throughput ×${1 + g.cafBoosts} with higher yield.`);
    scheduleUI();
  }, [paintBar, paintTimer, paintBtn, showToast, scheduleUI]);

  // ── DERIVED ───────────────────────────────────────────────────────────────
  const bizSnaps       = uiSnap.businesses;
  const managedCount   = bizSnaps.filter(b => b.hasManager).length;
  const totalUpgrades  = bizSnaps.reduce((s, b) => s + b.level - 1, 0);
  const domPts         = bizSnaps.reduce((s, b) => s + 1 + (b.level - 1) * 0.5 + (b.hasManager ? 10 : 0), 0);
  const domPct         = Math.min(100, domPts);
  const threshold      = rebirthThreshold(uiSnap.rebirthCount);
  const rebirthProg    = Math.min(1, uiSnap.lifetime / threshold);
  const wouldEarn      = boostsEarned(uiSnap.lifetime, uiSnap.rebirthCount);
  const canRebirthNow  = uiSnap.lifetime >= threshold;
  const optimalRebirth = canRebirthNow && uiSnap.cafBoosts > 0 && wouldEarn >= uiSnap.cafBoosts;

  const idlePps = useMemo(
    () =>
      computePoundsPerSecond({
        businesses: bizSnaps,
        cafBoosts: uiSnap.cafBoosts,
        superboost: uiSnap.superboost,
        purchasedUpgrades: uiSnap.purchasedUpgrades ?? [],
      }),
    [bizSnaps, uiSnap.cafBoosts, uiSnap.superboost, uiSnap.purchasedUpgrades]
  );

  const superRemMs =
    uiSnap.superboostMult > 1 && uiSnap.superboost
      ? Math.max(0, uiSnap.superboost.expiresAt - Date.now())
      : 0;
  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0d120b;font-family:'Nunito',sans-serif;}
        @keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes floatUp{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-60px) scale(1.2)}}
        @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes balPulse{0%,100%{text-shadow:0 0 8px rgba(143,221,159,.3)}50%{text-shadow:0 0 24px rgba(143,221,159,.9)}}
        @keyframes glowPulse{0%,100%{box-shadow:0 0 12px rgba(92,184,92,.3)}50%{box-shadow:0 0 28px rgba(92,184,92,.7)}}
        @keyframes cafGlow{0%,100%{box-shadow:0 0 10px rgba(212,168,67,.3)}50%{box-shadow:0 0 24px rgba(212,168,67,.7)}}
        @keyframes cupGlow{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
        @keyframes cupBounce{0%{transform:scale(1)}35%{transform:scale(1.14)}100%{transform:scale(1)}}
        @keyframes superSbPulse{0%,100%{opacity:.88;text-shadow:0 0 6px rgba(240,192,64,.35)}50%{opacity:1;text-shadow:0 0 12px rgba(255,220,120,.8)}}
        .biz-grid{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:start;}
        @media (max-width:899px){.biz-grid{grid-template-columns:1fr;}}
        button:hover{filter:brightness(1.12);}
        button:active{filter:brightness(.9);transform:scale(.97);}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-track{background:#0a0f09;}
        ::-webkit-scrollbar-thumb{background:#2a3a26;border-radius:3px;}
        .shop-backdrop{position:fixed;inset:0;z-index:149;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .22s ease;}
        .shop-backdrop-on{opacity:1;pointer-events:auto;}
        .shop-panel{position:fixed;top:0;right:0;height:100vh;width:340px;max-width:100%;background:#0d120b;border-left:2px solid #1e3018;z-index:150;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .25s ease;box-shadow:-8px 0 28px rgba(0,0,0,.55);}
        .shop-panel-on{transform:translateX(0);}
        @media (max-width:600px){.shop-panel{width:100%;max-width:100vw;}}
      `}</style>

      <main role="main" aria-label="Bishopton quantitative operations console: metrics, visualization, and serialized workspace parameters">
      <div style={{
        minHeight:"100vh", paddingBottom:32,
        background:"radial-gradient(ellipse at 30% 0%,rgba(74,124,89,.1) 0%,transparent 50%),radial-gradient(ellipse at 70% 100%,rgba(100,70,20,.08) 0%,transparent 50%),#0d120b",
      }}>

        {/* ── HEADER ── */}
        <div style={{
          position:"sticky", top:0, zIndex:100,
          background:"linear-gradient(180deg,#090e08,#0f160e)",
          borderBottom:"2px solid #1e3018",
          padding:"10px 16px", boxShadow:"0 4px 20px rgba(0,0,0,.7)",
        }}>
          <div style={{ maxWidth:1100, margin:"0 auto" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{
                  width:44, height:44, borderRadius:12,
                  background:"linear-gradient(135deg,#2a4a28,#4a7c59)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  border:"2px solid #5cb85c", flexShrink:0,
                  animation:"glowPulse 3s ease-in-out infinite",
                }}>
                  <BarChart3 size={22} color="#8fdd9f" />
                </div>
                <div>
                  <div style={{ fontWeight:900, fontSize:15, color:"#e8dcc8", lineHeight:1.1 }}>Mr White's</div>
                  <div style={{ fontWeight:900, fontSize:11, color:"#5cb85c", letterSpacing:".15em", textTransform:"uppercase" }}>
                    Bishopton Operations Console
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setShowShop(true)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 2, padding: "6px 10px", borderRadius: 10,
                    background: "linear-gradient(135deg,#1a2418,#0f1610)",
                    border: "2px solid #2a4030", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <ShoppingBag size={20} color="#d4a843" />
                  <span style={{ fontSize: 8, fontWeight: 800, color: "#8a9a78", textTransform: "uppercase", letterSpacing: ".06em" }}>Shop</span>
                </button>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:9, color:"#3a5a34", fontWeight:700, textTransform:"uppercase", letterSpacing:".1em", marginBottom:2 }}>
                  Total Funds
                </div>
                <div style={{
                  fontFamily:"'DM Mono',monospace", fontWeight:700, fontSize:22,
                  color:"#8fdd9f", lineHeight:1, animation:"balPulse 3s ease-in-out infinite",
                }}>
                  {fmt(uiSnap.balance)}
                </div>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5,
                  marginTop: 4, fontSize: 11, fontFamily: "'DM Mono',monospace",
                  color: "#6aab7a", fontWeight: 600,
                }}>
                  <Activity size={12} color="#5cb85c" />
                  <span>{fmtPerSec(idlePps)}</span>
                  <span style={{ fontSize: 8, color: "#3a5a40", fontWeight: 700, textTransform: "uppercase" }}>
                    auto
                  </span>
                </div>
                {uiSnap.superboostMult > 1 && uiSnap.superboost && (
                  <div style={{
                    marginTop: 5,
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#f0c040",
                    fontFamily: "'DM Mono',monospace",
                    animation: "superSbPulse 1.4s ease-in-out infinite",
                  }}>
                    ☕ SUPERBOOST ×{uiSnap.superboost.multiplier} — {fmtRemainShort(superRemMs)}
                  </div>
                )}
              </div>
              </div>
            </div>

            {/* Operational reach bar */}
            <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:8 }}>
              <Trophy size={10} color="#d4a843" />
              <span style={{ fontSize:9, color:"#7a6020", fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", flexShrink:0 }}>
                Operational reach
              </span>
              <div style={{ flex:1, height:7, background:"#0a0f09", borderRadius:4, overflow:"hidden", border:"1px solid #1e2a1a" }}>
                <div style={{
                  height:"100%", width:`${domPct}%`,
                  background:"linear-gradient(90deg,#3a7a3a,#d4a843 60%,#dd4444)",
                  borderRadius:4, transition:"width .8s ease",
                }} />
              </div>
              <span style={{ fontSize:10, fontFamily:"monospace", color:"#d4a843", fontWeight:700, flexShrink:0 }}>
                {domPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* ── STATS ROW ── */}
        <div style={{ maxWidth:1100, margin:"10px auto 0", padding:"0 12px" }}>
          <div style={{
            display:"flex", gap:6,
            background:"#0f180d", border:"1px solid #1e2e1a",
            borderRadius:10, padding:"8px 10px",
          }}>
            {[
              { icon:<Coins size={11} color="#8fdd9f"/>,     label:"Lifetime",  value:fmtShort(uiSnap.lifetime) },
              { icon:<UserCheck size={11} color="#d4a843"/>, label:"Managers",  value:`${managedCount}/${BUSINESSES.length}` },
              { icon:<TrendingUp size={11} color="#5cb85c"/>,label:"Upgrades",  value:totalUpgrades },
              { icon:<span style={{fontSize:11}}>☕</span>,  label:"Boosts",    value:uiSnap.cafBoosts },
              { icon:<RefreshCw size={11} color="#9b59b6"/>, label:"Resets",  value:uiSnap.rebirthCount },
            ].map(({ icon, label, value }) => (
              <div key={label} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                  {icon}
                  <span style={{ fontSize:7, color:"#3a4a36", fontWeight:700, textTransform:"uppercase", letterSpacing:".05em" }}>{label}</span>
                </div>
                <span style={{ fontSize:11, fontFamily:"monospace", color:"#b0d0a8", fontWeight:600 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── UPGRADE BULK (Tier 1) ── */}
        <div style={{ maxWidth:1100, margin:"8px auto 0", padding:"0 12px" }}>
          <div style={{
            display:"flex", flexWrap:"wrap", alignItems:"center", gap:8,
            background:"#0f180d", border:"1px solid #1e2e1a",
            borderRadius:10, padding:"8px 10px",
          }}>
            <span style={{ fontSize:9, color:"#5a7050", fontWeight:800, textTransform:"uppercase", letterSpacing:".08em" }}>
              Acquisition batch
            </span>
            {[1, 10, 100, "max"].map((m) => (
              <button
                key={String(m)}
                type="button"
                onClick={() => setBulkBuy(m)}
                style={{
                  padding:"4px 10px", borderRadius:8, fontSize:11, fontWeight:800, fontFamily:"inherit", cursor:"pointer",
                  border:`2px solid ${uiSnap.bulkBuy === m ? "#5cb85c" : "#1e2e1a"}`,
                  background: uiSnap.bulkBuy === m ? "linear-gradient(135deg,#2a4028,#3a5c34)" : "#141c12",
                  color: uiSnap.bulkBuy === m ? "#e8fcc8" : "#5a7050",
                }}
              >
                {m === "max" ? "Max" : `×${m}`}
              </button>
            ))}
            <span style={{ fontSize:8, color:"#3a4a36", marginLeft:"auto", maxWidth:200, textAlign:"right" }}>
              Each row uses this for its Upgrade button.
            </span>
          </div>
        </div>

        {/* ── REBIRTH PANEL ── */}
        <div style={{ maxWidth:1100, margin:"10px auto 0", padding:"0 12px" }}>
          <div style={{
            background: canRebirthNow
              ? "linear-gradient(135deg,#1a2e14,#0e2010)"
              : "linear-gradient(135deg,#161e12,#0e1610)",
            border: `2px solid ${canRebirthNow ? "#5cb85c" : "#1e2e1a"}`,
            borderRadius: 12, padding: "12px 14px",
            boxShadow: canRebirthNow ? "0 0 20px rgba(92,184,92,.2)" : "none",
            transition: "all .5s",
          }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                  <RefreshCw size={13} color={canRebirthNow ? "#8fdd9f" : "#3a5030"} />
                  <span style={{ fontSize:11, fontWeight:900, color: canRebirthNow ? "#c8e8c0" : "#3a5030", textTransform:"uppercase", letterSpacing:".08em" }}>
                    Workspace reset (caffeine index)
                  </span>
                  {uiSnap.cafBoosts > 0 && (
                    <span style={{
                      background:"rgba(212,168,67,.15)", border:"1px solid #7a5020",
                      borderRadius:999, padding:"1px 6px",
                      fontSize:9, fontWeight:700, color:"#d4a843",
                      animation:"cafGlow 2s ease-in-out infinite",
                    }}>
                      ☕×{uiSnap.cafBoosts} active
                    </span>
                  )}
                </div>

                {/* Rebirth progress bar */}
                <div style={{ height:8, background:"#060c05", borderRadius:4, overflow:"hidden", border:"1px solid #1a2a16", marginBottom:4 }}>
                  <div style={{
                    height:"100%",
                    width:`${rebirthProg * 100}%`,
                    background: canRebirthNow
                      ? "linear-gradient(90deg,#3a8030,#8fdd9f)"
                      : "linear-gradient(90deg,#2a5020,#5cb85c)",
                    borderRadius:4, transition:"width .5s",
                    boxShadow: canRebirthNow ? "0 0 8px rgba(143,221,159,.5)" : "none",
                  }} />
                </div>

                <div style={{ fontSize:10, color:"#4a6a44", fontFamily:"monospace" }}>
                  {fmtShort(uiSnap.lifetime)} / {fmtShort(threshold)} cumulative
                  {canRebirthNow && (
                    <span style={{ color:"#8fdd9f", fontWeight:700 }}> · +{wouldEarn} index increment{wouldEarn !== 1 ? "s" : ""} available</span>
                  )}
                </div>
                {optimalRebirth && (
                  <div style={{ fontSize: 10, color: "#8fdd9f", fontWeight: 700, marginTop: 6 }}>
                    Favourable reset window: this session’s index gain meets or exceeds your banked index — execute a reset for a large throughput gain.
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowRebirth(true)}
                style={{
                  background: canRebirthNow
                    ? "linear-gradient(135deg,#2a5028,#5cb85c)"
                    : "#141c12",
                  border: `2px solid ${canRebirthNow ? "#5cb85c" : "#1e2a1a"}`,
                  borderRadius: 10, padding: "8px 14px",
                  color: canRebirthNow ? "#fff" : "#2a4028",
                  fontWeight: 800, fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  animation: canRebirthNow ? "glowPulse 1.5s ease-in-out infinite" : "none",
                  flexShrink: 0,
                }}
              >
                ☕ Reset workspace
              </button>
            </div>
          </div>
        </div>

        {/* ── BUSINESSES ── */}
        <div style={{ maxWidth:1100, margin:"10px auto 0", padding:"0 12px" }}>
          <div style={{
            display:"flex", alignItems:"center", gap:8, marginBottom:8,
            padding:"6px 10px",
            background:"linear-gradient(90deg,#1a2e14,transparent)",
            borderLeft:"3px solid #5cb85c", borderRadius:"0 6px 6px 0",
          }}>
            <ChevronRight size={12} color="#5cb85c" />
            <span style={{ fontSize:10, fontWeight:900, color:"#5cb85c", textTransform:"uppercase", letterSpacing:".12em" }}>
              Bishopton operational units
            </span>
            {uiSnap.cafBoosts > 0 ? (
              <span style={{ fontSize:10, color:"#d4a843", fontWeight:700, marginLeft:"auto", textAlign: "right" }}>
                ☕ ×{1 + uiSnap.cafBoosts} yield · +{uiSnap.cafBoosts * 8}% cycle latency · tier thresholds at 10/25/50…
              </span>
            ) : (
              <span style={{ fontSize:9, color:"#4a5a46", fontWeight:600, marginLeft:"auto", textAlign: "right" }}>
                Reference-tier thresholds 10 → 500 adjust latency and yield
              </span>
            )}
          </div>

          <div className="biz-grid">
            <div>
              {BUSINESSES.map((def, i) => {
                if (def.world !== 1) return null;
                return (
                  <BusinessRow
                    key={def.id}
                    def={def}
                    bsSnap={bizSnaps[i]}
                    balance={uiSnap.balance}
                    cafBoosts={uiSnap.cafBoosts}
                    superboostMult={uiSnap.superboostMult}
                    purchasedUpgrades={uiSnap.purchasedUpgrades ?? []}
                    bulkBuy={uiSnap.bulkBuy}
                    barRef={barRefs.current[i]}
                    btnRef={btnRefs.current[i]}
                    timerRef={timerRefs.current[i]}
                    onAction={handleAction}
                    onUpgrade={handleUpgrade}
                    onHireManager={handleHireManager}
                  />
                );
              })}
            </div>
            <div style={{ width: 140, maxWidth: "100%", justifySelf: "center" }}>
              <CupMinigame
                lastCupPlayedAt={uiSnap.lastCupPlayedAt}
                superboost={uiSnap.superboost}
                onSessionEnd={handleCupComplete}
              />
            </div>
            <div>
              {BUSINESSES.map((def, i) => {
                if (def.world !== 2) return null;
                const gProxy = { cafBoosts: uiSnap.cafBoosts };
                if (isWorld2Locked(gProxy, i)) {
                  return <LockedBusinessRow key={def.id} def={def} cafBoosts={uiSnap.cafBoosts} />;
                }
                return (
                  <BusinessRow
                    key={def.id}
                    def={def}
                    bsSnap={bizSnaps[i]}
                    balance={uiSnap.balance}
                    cafBoosts={uiSnap.cafBoosts}
                    superboostMult={uiSnap.superboostMult}
                    purchasedUpgrades={uiSnap.purchasedUpgrades ?? []}
                    bulkBuy={uiSnap.bulkBuy}
                    barRef={barRefs.current[i]}
                    btnRef={btnRefs.current[i]}
                    timerRef={timerRefs.current[i]}
                    onAction={handleAction}
                    onUpgrade={handleUpgrade}
                    onHireManager={handleHireManager}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ textAlign:"center", marginTop:16, fontSize:9, color:"#3a4a36", letterSpacing:".1em" }}>
          BISHOPTON · COUNTY DURHAM · AUTO-SAVES EVERY 5 SECONDS
        </div>
      </div>

      <ShopPanel
        isOpen={showShop}
        onClose={() => setShowShop(false)}
        purchasedUpgrades={uiSnap.purchasedUpgrades ?? []}
        balance={uiSnap.balance}
        businesses={bizSnaps}
        onBuy={handleBuyUpgrade}
      />

      {showRebirth && (
        <RebirthModal
          game={gameRef.current}
          onConfirm={handleRebirth}
          onCancel={() => setShowRebirth(false)}
        />
      )}

      <Toast msg={toast} />
      <FloatLabels labels={floats} />
      </main>
    </>
  );
}
