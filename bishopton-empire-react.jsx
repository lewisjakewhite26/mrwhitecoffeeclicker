import { useState, useEffect, useRef, useCallback } from "react";
import {
  ShoppingBag, Beer, Coffee, Factory, Globe,
  TrendingUp, UserCheck, Zap, Trophy, BarChart3,
  ChevronRight, Coins, Users, RefreshCw, Coffee as CoffeeIcon,
  X, AlertTriangle, Star
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

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmt        = (n) => n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
// cafBoost multiplies profit: each boost = +100% profit
const getProfit  = (def, bs, cafBoosts) =>
  def.baseProfit * bs.level * (1 + cafBoosts);
// Each level reduces duration by 12% (was 4%) — much more noticeable.
// Caffeine boosts also speed things up: each boost = further 8% speed bonus, stacks multiplicatively.
const getDur     = (def, bs, cafBoosts) => {
  const levelSpeedup  = 1 + (bs.level - 1) * 0.12;
  const boostSpeedup  = 1 + cafBoosts * 0.08;
  return def.baseDuration / (levelSpeedup * boostSpeedup);
};
const getUpgCost = (def, bs) => def.upgradeCostBase * Math.pow(1.45, bs.level);
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

// ─── PERSISTENT GAME STATE ───────────────────────────────────────────────────

function makeDefaultGame() {
  return {
    balance:      0,
    lifetime:     0,
    cafBoosts:    0,   // total caffeine boosts accumulated across all rebirths
    rebirthCount: 0,
    businesses: BUSINESSES.map(b => ({
      id: b.id, level: 1, hasManager: false,
      running: false, startTime: null, readyToCollect: false,
    })),
  };
}

function loadGame() {
  try {
    const raw = localStorage.getItem("bishoptonEmpire_v5");
    if (!raw) return makeDefaultGame();
    const p = JSON.parse(raw);
    return {
      balance:      p.balance      ?? 0,
      lifetime:     p.lifetime     ?? 0,
      cafBoosts:    p.cafBoosts    ?? 0,
      rebirthCount: p.rebirthCount ?? 0,
      businesses: BUSINESSES.map((b, i) => ({
        id: b.id,
        level:      p.businesses?.[i]?.level      ?? 1,
        hasManager: p.businesses?.[i]?.hasManager ?? false,
        running: false, startTime: null, readyToCollect: false,
      })),
    };
  } catch { return makeDefaultGame(); }
}

function saveGame(g) {
  try {
    localStorage.setItem("bishoptonEmpire_v5", JSON.stringify({
      balance:      g.balance,
      lifetime:     g.lifetime,
      cafBoosts:    g.cafBoosts,
      rebirthCount: g.rebirthCount,
      businesses: g.businesses.map(b => ({ id: b.id, level: b.level, hasManager: b.hasManager })),
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
            Reset your empire for a permanent boost
          </div>
        </div>

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
            Each boost gives:<br />
            • <strong style={{ color: "#8fdd9f" }}>×{(1 + newTotal).toFixed(0)} profit</strong> on every business<br />
            • <strong style={{ color: "#8fdd9f" }}>+{(newTotal * 8).toFixed(0)}% speed</strong> on every run
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

function BusinessRow({ def, bsSnap, balance, cafBoosts, barRef, btnRef, timerRef, onAction, onUpgrade, onHireManager }) {
  const { Icon, color, darkColor } = def;
  const upgCost = getUpgCost(def, bsSnap);
  const canUpg  = balance >= upgCost;
  const canHire = balance >= def.managerCost;
  const dur     = getDur(def, bsSnap, cafBoosts);
  const profit  = getProfit(def, bsSnap, cafBoosts);

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

          {/* Profit + timer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 10, color: "#6aab7a", fontFamily: "monospace", fontWeight: 600 }}>
              {fmt(profit)}/run
            </span>
            <span ref={timerRef} style={{ fontSize: 10, fontFamily: "monospace", color: "#6a7a66" }}>
              {fmtTime(dur)}
            </span>
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
              {fmt(upgCost)}
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

export default function App() {
  const gameRef = useRef(loadGame());

  const [uiSnap,       setUiSnap]       = useState(() => snap(gameRef.current));
  const [toast,        setToast]        = useState(null);
  const [floats,       setFloats]       = useState([]);
  const [showRebirth,  setShowRebirth]  = useState(false);

  const toastTimer  = useRef(null);
  const rafRef      = useRef(null);
  const lastSaveRef = useRef(0);
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
    const loop = (now) => {
      const g = gameRef.current;
      let uiChanged = false;

      g.businesses.forEach((bs, i) => {
        const def = BUSINESSES[i];
        if (!bs.running) {
          paintBar(i, bs.readyToCollect ? 1 : 0, bs.readyToCollect);
          return;
        }
        const dur      = getDur(def, bs, g.cafBoosts);
        const elapsed  = now - bs.startTime;
        const progress = Math.min(1, elapsed / dur);

        paintBar(i, progress, false);
        paintTimer(i, dur - elapsed, false);

        if (progress >= 1) {
          if (bs.hasManager) {
            g.balance  += getProfit(def, bs, g.cafBoosts);
            g.lifetime += getProfit(def, bs, g.cafBoosts);
            bs.startTime = now;
            paintBar(i, 0, false);
            uiChanged = true;
          } else {
            bs.running        = false;
            bs.readyToCollect = true;
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

  // Auto-start managed on mount
  useEffect(() => {
    const now = performance.now();
    gameRef.current.businesses.forEach(bs => {
      if (bs.hasManager) { bs.running = true; bs.startTime = now; }
    });
    scheduleUI();
  }, [scheduleUI]);

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
      spawnFloat(e, fmt(profit));
      paintBar(i, 0, false);
      paintTimer(i, getDur(def, bs, g.cafBoosts), false);
      paintBtn(i, bs);
      scheduleUI();
    } else if (!bs.running) {
      bs.running   = true;
      bs.startTime = performance.now();
      paintBtn(i, bs);
      scheduleUI();
    }
  }, [spawnFloat, paintBar, paintTimer, paintBtn, scheduleUI]);

  const handleUpgrade = useCallback((id) => {
    const g   = gameRef.current;
    const i   = BUSINESSES.findIndex(d => d.id === id);
    const bs  = g.businesses[i];
    const def = BUSINESSES[i];
    const cost= getUpgCost(def, bs);
    if (g.balance < cost) return;
    g.balance -= cost;
    bs.level++;
    showToast(`⬆ ${def.shortName} → Level ${bs.level}! Runs ${(getDur(def, bs, g.cafBoosts) / 1000).toFixed(1)}s`);
    scheduleUI();
  }, [showToast, scheduleUI]);

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
    bs.startTime  = performance.now();
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
      running: false, startTime: null, readyToCollect: false,
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
            {uiSnap.cafBoosts > 0 && (
              <span style={{ fontSize:10, color:"#d4a843", fontWeight:700, marginLeft:"auto" }}>
                ☕ ×{1 + uiSnap.cafBoosts} profit · +{uiSnap.cafBoosts * 8}% speed
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
              barRef={barRefs.current[i]}
              btnRef={btnRefs.current[i]}
              timerRef={timerRefs.current[i]}
              onAction={handleAction}
              onUpgrade={handleUpgrade}
              onHireManager={handleHireManager}
            />
          ))}
        </div>

        <div style={{ textAlign:"center", marginTop:16, fontSize:9, color:"#1e2e1a", letterSpacing:".1em" }}>
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
