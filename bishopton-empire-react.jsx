import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ShoppingBag, Beer, Coffee, Factory, Globe,
  TrendingUp, UserCheck, Zap, Trophy, BarChart3,
  ChevronRight, Coins, Users, RefreshCw, Coffee as CoffeeIcon,
  X, AlertTriangle, Star, Activity, Flag,
} from "lucide-react";

// ─── GAME DATA ────────────────────────────────────────────────────────────────

const BUSINESSES = [
  {
    id: "pavement", name: "White's Pavement Pitch", shortName: "Pavement Pitch",
    Icon: ShoppingBag, color: "#5cb85c", darkColor: "#2e6e2e",
    baseDuration: 800,   baseProfit: 1.5,   upgradeCostBase: 25,
    managerCost: 75,    managerName: "Barry the Barker",
  },
  {
    id: "brewbar", name: "The Bishopton Brew-Bar", shortName: "Brew-Bar",
    Icon: Beer, color: "#e8a020", darkColor: "#8a5c08",
    baseDuration: 3000,  baseProfit: 8,     upgradeCostBase: 120,
    managerCost: 350,   managerName: "Peggy the Barmaid",
  },
  {
    id: "coffeehouse", name: "White's Coffee House", shortName: "Coffee House",
    Icon: CoffeeIcon, color: "#c0784a", darkColor: "#7a4018",
    baseDuration: 8000,  baseProfit: 40,    upgradeCostBase: 500,
    managerCost: 1500,  managerName: "Patricia the Barista",
  },
  {
    id: "industrial", name: "Bishopton Industrial Estate", shortName: "Industrial Estate",
    Icon: Factory, color: "#5b8fa8", darkColor: "#2a5068",
    baseDuration: 30000, baseProfit: 250,   upgradeCostBase: 3000,
    managerCost: 10000, managerName: "Derek the Foreman",
  },
  {
    id: "global", name: "White & Sons Global", shortName: "W&S Global",
    Icon: Globe, color: "#9b59b6", darkColor: "#5a2878",
    baseDuration: 120000,baseProfit: 2000,  upgradeCostBase: 20000,
    managerCost: 75000, managerName: "Sir Reginald Fortescue-White",
  },
];

// ─── REBIRTH CONFIG ───────────────────────────────────────────────────────────
// First rebirth needs £10k lifetime. Each subsequent one needs 3× more.
const REBIRTH_BASE    = 10000;
const REBIRTH_SCALE   = 3;

function rebirthThreshold(rebirthCount) {
  return REBIRTH_BASE * Math.pow(REBIRTH_SCALE, rebirthCount);
}

// How many boosts earned by rebirthing now
function boostsEarned(lifetime, rebirthCount) {
  // 1 boost per threshold reached, scaling with rebirth count
  return Math.max(1, Math.floor(lifetime / rebirthThreshold(rebirthCount)));
}

// ─── LEVEL MILESTONES (AdVenture-style quantity tiers) ───────────────────────
// Hitting each tier on a business multiplies that business only (profit + speed).
const LEVEL_MILESTONES = [25, 50, 100, 200, 300, 400, 500];

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

const fmt        = (n) => n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
// cafBoost multiplies profit: each boost = +100% profit (global “angel” analogue)
const getProfit  = (def, bs, cafBoosts) =>
  def.baseProfit * bs.level * (1 + cafBoosts) * milestoneProfitMult(bs.level);
// Each level reduces duration by 12%. Caffeine boosts add speed. Milestones add more.
const getDur     = (def, bs, cafBoosts) => {
  const levelSpeedup  = 1 + (bs.level - 1) * 0.12;
  const boostSpeedup  = 1 + cafBoosts * 0.08;
  return def.baseDuration / (levelSpeedup * boostSpeedup * milestoneSpeedMult(bs.level));
};
const getUpgCost = (def, bs) => def.upgradeCostBase * Math.pow(1.45, bs.level);

function singleUpgradeCost(def, level) {
  return def.upgradeCostBase * Math.pow(1.45, level);
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

      let cycleStart = bs.runStartedAt;
      const dur = getDur(def, bs, game.cafBoosts);
      if (dur < 50) continue;

      const profit = getProfit(def, bs, game.cafBoosts);
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
const fmtShort   = (n) => {
  if (n >= 1e9) return `£${(n / 1e9).toFixed(1)}bn`;
  if (n >= 1e6) return `£${(n / 1e6).toFixed(1)}m`;
  if (n >= 1e3) return `£${(n / 1e3).toFixed(1)}k`;
  return fmt(n);
};

/** Automated income only (managers running), £ per second */
function computePoundsPerSecond(g) {
  let pps = 0;
  g.businesses.forEach((bs, i) => {
    if (!bs.hasManager || !bs.running) return;
    const def = BUSINESSES[i];
    const dur = getDur(def, bs, g.cafBoosts);
    if (dur <= 0) return;
    pps += (getProfit(def, bs, g.cafBoosts) / dur) * 1000;
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

/** @returns {{ game: object, offline: { awayMs: number, extraEarned: number } }} */
function loadGame() {
  const now = Date.now();
  let game;
  let fromV5 = false;

  try {
    const raw6 = localStorage.getItem(SAVE_KEY_V6);
    if (raw6) {
      const p = JSON.parse(raw6);
      game = {
        balance:      p.balance ?? 0,
        lifetime:     p.lifetime ?? 0,
        cafBoosts:    p.cafBoosts ?? 0,
        rebirthCount: p.rebirthCount ?? 0,
        lastSavedAt:  typeof p.lastSavedAt === "number" ? p.lastSavedAt : now,
        bulkBuy:
          p.bulkBuy === 10 || p.bulkBuy === 100 || p.bulkBuy === "max" ? p.bulkBuy : 1,
        businesses: BUSINESSES.map((b, i) => {
          const s = p.businesses?.[i];
          return {
            id: b.id,
            level:      s?.level ?? 1,
            hasManager: s?.hasManager ?? false,
            running:       !!s?.running,
            readyToCollect: !!s?.readyToCollect,
            runStartedAt: typeof s?.runStartedAt === "number" ? s.runStartedAt : null,
          };
        }),
      };
    } else {
      const raw5 = localStorage.getItem(SAVE_KEY_V5);
      if (raw5) {
        fromV5 = true;
        const p = JSON.parse(raw5);
        game = {
          balance:      p.balance ?? 0,
          lifetime:     p.lifetime ?? 0,
          cafBoosts:    p.cafBoosts ?? 0,
          rebirthCount: p.rebirthCount ?? 0,
          lastSavedAt:  now,
          bulkBuy:      1,
          businesses: BUSINESSES.map((b, i) =>
            migrateBusinessFromSaveV5(p.businesses?.[i] ?? {}, b.id)
          ),
        };
      } else {
        game = makeDefaultGame();
      }
    }
  } catch {
    game = makeDefaultGame();
  }

  const offline = applyOfflineDelta(game, now);
  if (fromV5) saveGame(game);

  return { game, offline };
}

function saveGame(g) {
  try {
    const t = Date.now();
    g.lastSavedAt = t;
    localStorage.setItem(SAVE_KEY_V6, JSON.stringify({
      saveVersion: 6,
      lastSavedAt: t,
      bulkBuy: g.bulkBuy ?? 1,
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
            Caffeine Rebirth
          </div>
          <div style={{ fontSize: 11, color: "#4a6a44", marginTop: 4 }}>
            Idle reset: wipe this run for permanent boosts (like angel investors — stack them forever)
          </div>
        </div>

        {optimalReset && (
          <div style={{
            background: "rgba(92,184,92,.12)", border: "1px solid #3a7030",
            borderRadius: 10, padding: "10px 12px", marginBottom: 14,
            fontSize: 11, color: "#a8d8a0", lineHeight: 1.45, fontWeight: 600,
          }}>
            <strong style={{ color: "#8fdd9f" }}>Strong time to reset:</strong> boosts from this run ({earned}) are at least your current total ({game.cafBoosts}). Your next run will feel much faster.
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
              <div style={{ fontSize: 12, color: "#e07060", fontWeight: 700 }}>Not enough lifetime earnings</div>
              <div style={{ fontSize: 11, color: "#7a4030", marginTop: 3 }}>
                You need {fmtShort(threshold)} lifetime to rebirth.<br />
                You have {fmtShort(game.lifetime)} so far.
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
            Total after rebirth: <span style={{ color: "#d4a843", fontWeight: 700 }}>{newTotal} ☕</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#4a7a40", lineHeight: 1.5 }}>
            Each boost stacks forever (global multiplier):<br />
            • <strong style={{ color: "#8fdd9f" }}>×{(1 + newTotal).toFixed(0)} profit</strong> on every business<br />
            • <strong style={{ color: "#8fdd9f" }}>+{(newTotal * 8).toFixed(0)}% speed</strong> on every run<br />
            <span style={{ color: "#5a7050", fontSize: 10 }}>
              Tip: keep buying managers so money keeps ticking while you are away; milestones (25, 50, 100…) on each business add huge per-business spikes.
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
            • All business levels<br />
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
            ☕ Rebirth Now
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BUSINESS ROW ─────────────────────────────────────────────────────────────

function BusinessRow({ def, bsSnap, balance, cafBoosts, bulkBuy, barRef, btnRef, timerRef, onAction, onUpgrade, onHireManager }) {
  const { Icon, color, darkColor } = def;
  const maxN   = countAffordFromBalance(balance, def, bsSnap.level);
  const nBuy   = bulkBuy === "max" ? maxN : Math.min(bulkBuy, maxN);
  const totalCost = nBuy > 0 ? sumUpgradeCostN(def, bsSnap.level, nBuy) : getUpgCost(def, bsSnap);
  const canUpg = nBuy > 0 && balance >= totalCost;
  const canHire = balance >= def.managerCost;
  const dur     = getDur(def, bsSnap, cafBoosts);
  const profit  = getProfit(def, bsSnap, cafBoosts);
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
            {bsSnap.readyToCollect ? "Collect!" : bsSnap.running ? "Running" : "Start"}
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
            }}>LVL {bsSnap.level}</span>
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

          {/* Profit + timer + milestones */}
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
              Milestones: <strong style={{ color: "#7aab80" }}>×{mProf.toFixed(2)}</strong> profit ·{" "}
              <strong style={{ color: "#7aab80" }}>×{mSpd.toFixed(2)}</strong> speed (this business)
            </span>
            {nextLv != null ? (
              <span style={{ color: "#6a6048" }}>
                Next spike at <strong style={{ color: "#d4a843" }}>Lv {nextLv}</strong>
              </span>
            ) : (
              <span style={{ color: "#5cb85c", fontWeight: 700 }}>All milestones cleared</span>
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
              <span style={{ fontSize: 8, fontWeight: 800, color: "#8fdd9f", textTransform: "uppercase", letterSpacing: ".05em" }}>Upgrade</span>
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

  const toastTimer  = useRef(null);
  const rafRef      = useRef(null);
  const lastSaveRef = useRef(Date.now());
  const pendingUI   = useRef(false);

  // DOM refs
  const barRefs   = useRef(BUSINESSES.map(() => ({ current: null })));
  const btnRefs   = useRef(BUSINESSES.map(() => ({ current: null })));
  const timerRefs = useRef(BUSINESSES.map(() => ({ current: null })));

  function snap(g) {
    return {
      balance:      g.balance,
      lifetime:     g.lifetime,
      cafBoosts:    g.cafBoosts,
      rebirthCount: g.rebirthCount,
      bulkBuy:      g.bulkBuy ?? 1,
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
      el.textContent = "✓ Ready!";
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
      if (label) label.textContent = "Collect!";
    } else if (bs.running) {
      btn.style.background = `linear-gradient(135deg,${def.darkColor},${def.color})`;
      btn.style.cursor     = "default";
      if (label) label.textContent = "Running";
    } else {
      btn.style.background = `linear-gradient(135deg,${def.darkColor},${def.color})`;
      btn.style.cursor     = "pointer";
      if (label) label.textContent = "Start";
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
        if (!bs.running) {
          paintBar(i, bs.readyToCollect ? 1 : 0, bs.readyToCollect);
          return;
        }
        if (bs.runStartedAt == null) {
          bs.runStartedAt = now;
          return;
        }
        const dur      = getDur(def, bs, g.cafBoosts);
        const elapsed  = now - bs.runStartedAt;
        const progress = Math.min(1, elapsed / dur);

        paintBar(i, progress, false);
        paintTimer(i, dur - elapsed, false);

        if (progress >= 1) {
          if (bs.hasManager) {
            g.balance  += getProfit(def, bs, g.cafBoosts);
            g.lifetime += getProfit(def, bs, g.cafBoosts);
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
    gameRef.current.businesses.forEach(bs => {
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

    if (bs.readyToCollect) {
      const profit   = getProfit(def, bs, g.cafBoosts);
      g.balance     += profit;
      g.lifetime    += profit;
      bs.readyToCollect = false;
      bs.running        = false;
      bs.runStartedAt    = null;
      spawnFloat(e, fmt(profit));
      paintBar(i, 0, false);
      paintTimer(i, getDur(def, bs, g.cafBoosts), false);
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
    const bs  = g.businesses[i];
    const def = BUSINESSES[i];
    const mode = g.bulkBuy ?? 1;
    const maxN = countAffordFromBalance(g.balance, def, bs.level);
    const n    = mode === "max" ? maxN : Math.min(mode, maxN);
    if (n < 1) return;

    const prevLevel = bs.level;
    const prevM     = milestoneCount(prevLevel);
    const costSum   = sumUpgradeCostN(def, bs.level, n);
    g.balance -= costSum;
    bs.level  += n;
    const newM = milestoneCount(bs.level);
    if (newM > prevM) {
      showToast(`Milestone! ${def.shortName} — huge profit & speed spike on this business`);
    } else if (n > 1) {
      showToast(`⬆ ${def.shortName} +${n} levels → Lv ${bs.level}`);
    } else {
      showToast(`⬆ ${def.shortName} → Level ${bs.level}! Runs ${(getDur(def, bs, g.cafBoosts) / 1000).toFixed(1)}s`);
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

    // Reset all bar DOMs
    BUSINESSES.forEach((_, i) => {
      paintBar(i, 0, false);
      paintTimer(i, getDur(BUSINESSES[i], g.businesses[i], g.cafBoosts), false);
      paintBtn(i, g.businesses[i]);
    });

    saveGame(g);
    setShowRebirth(false);
    showToast(`☕ Rebirthed! You now have ${g.cafBoosts} Caffeine Boost${g.cafBoosts !== 1 ? "s" : ""}! Everything is ×${1 + g.cafBoosts} faster and more profitable.`);
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
    () => computePoundsPerSecond({ businesses: bizSnaps, cafBoosts: uiSnap.cafBoosts }),
    [bizSnaps, uiSnap.cafBoosts]
  );

  // ── RENDER ────────────────────────────────────────────────────────────────
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
        button:hover{filter:brightness(1.12);}
        button:active{filter:brightness(.9);transform:scale(.97);}
        ::-webkit-scrollbar{width:5px;}
        ::-webkit-scrollbar-track{background:#0a0f09;}
        ::-webkit-scrollbar-thumb{background:#2a3a26;border-radius:3px;}
      `}</style>

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
          <div style={{ maxWidth:640, margin:"0 auto" }}>
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
                    Bishopton Empire
                  </div>
                </div>
              </div>
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
              </div>
            </div>

            {/* Domination bar */}
            <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:8 }}>
              <Trophy size={10} color="#d4a843" />
              <span style={{ fontSize:9, color:"#7a6020", fontWeight:700, textTransform:"uppercase", letterSpacing:".08em", flexShrink:0 }}>
                Domination
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
        <div style={{ maxWidth:640, margin:"10px auto 0", padding:"0 12px" }}>
          <div style={{
            display:"flex", gap:6,
            background:"#0f180d", border:"1px solid #1e2e1a",
            borderRadius:10, padding:"8px 10px",
          }}>
            {[
              { icon:<Coins size={11} color="#8fdd9f"/>,     label:"Lifetime",  value:fmtShort(uiSnap.lifetime) },
              { icon:<UserCheck size={11} color="#d4a843"/>, label:"Managers",  value:`${managedCount}/5` },
              { icon:<TrendingUp size={11} color="#5cb85c"/>,label:"Upgrades",  value:totalUpgrades },
              { icon:<span style={{fontSize:11}}>☕</span>,  label:"Boosts",    value:uiSnap.cafBoosts },
              { icon:<RefreshCw size={11} color="#9b59b6"/>, label:"Rebirths",  value:uiSnap.rebirthCount },
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
        <div style={{ maxWidth:640, margin:"8px auto 0", padding:"0 12px" }}>
          <div style={{
            display:"flex", flexWrap:"wrap", alignItems:"center", gap:8,
            background:"#0f180d", border:"1px solid #1e2e1a",
            borderRadius:10, padding:"8px 10px",
          }}>
            <span style={{ fontSize:9, color:"#5a7050", fontWeight:800, textTransform:"uppercase", letterSpacing:".08em" }}>
              Buy upgrades
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
        <div style={{ maxWidth:640, margin:"10px auto 0", padding:"0 12px" }}>
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
                    Caffeine Rebirth
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
                  {fmtShort(uiSnap.lifetime)} / {fmtShort(threshold)} lifetime
                  {canRebirthNow && (
                    <span style={{ color:"#8fdd9f", fontWeight:700 }}> · +{wouldEarn} boost{wouldEarn !== 1 ? "s" : ""} ready!</span>
                  )}
                </div>
                {optimalRebirth && (
                  <div style={{ fontSize: 10, color: "#8fdd9f", fontWeight: 700, marginTop: 6 }}>
                    Strong reset window: boosts from this run ≥ your banked boosts — rebirth for a big jump.
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
                ☕ Rebirth
              </button>
            </div>
          </div>
        </div>

        {/* ── BUSINESSES ── */}
        <div style={{ maxWidth:640, margin:"10px auto 0", padding:"0 12px" }}>
          <div style={{
            display:"flex", alignItems:"center", gap:8, marginBottom:8,
            padding:"6px 10px",
            background:"linear-gradient(90deg,#1a2e14,transparent)",
            borderLeft:"3px solid #5cb85c", borderRadius:"0 6px 6px 0",
          }}>
            <ChevronRight size={12} color="#5cb85c" />
            <span style={{ fontSize:10, fontWeight:900, color:"#5cb85c", textTransform:"uppercase", letterSpacing:".12em" }}>
              Bishopton Businesses
            </span>
            {uiSnap.cafBoosts > 0 ? (
              <span style={{ fontSize:10, color:"#d4a843", fontWeight:700, marginLeft:"auto", textAlign: "right" }}>
                ☕ ×{1 + uiSnap.cafBoosts} profit · +{uiSnap.cafBoosts * 8}% speed · milestones at 25/50/100…
              </span>
            ) : (
              <span style={{ fontSize:9, color:"#4a5a46", fontWeight:600, marginLeft:"auto", textAlign: "right" }}>
                Level milestones 25 → 500 spike speed & profit
              </span>
            )}
          </div>

          {BUSINESSES.map((def, i) => (
            <BusinessRow
              key={def.id}
              def={def}
              bsSnap={bizSnaps[i]}
              balance={uiSnap.balance}
              cafBoosts={uiSnap.cafBoosts}
              bulkBuy={uiSnap.bulkBuy}
              barRef={barRefs.current[i]}
              btnRef={btnRefs.current[i]}
              timerRef={timerRefs.current[i]}
              onAction={handleAction}
              onUpgrade={handleUpgrade}
              onHireManager={handleHireManager}
            />
          ))}
        </div>

        <div style={{ textAlign:"center", marginTop:16, fontSize:9, color:"#3a4a36", letterSpacing:".1em" }}>
          BISHOPTON · COUNTY DURHAM · AUTO-SAVES EVERY 5 SECONDS
        </div>
      </div>

      {showRebirth && (
        <RebirthModal
          game={gameRef.current}
          onConfirm={handleRebirth}
          onCancel={() => setShowRebirth(false)}
        />
      )}

      <Toast msg={toast} />
      <FloatLabels labels={floats} />
    </>
  );
}
