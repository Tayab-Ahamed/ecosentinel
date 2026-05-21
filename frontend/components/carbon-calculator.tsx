"use client";

import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ecoApi, CarbonRecommendation } from "@/lib/api";

// IPCC 2023 emission factors (kg CO2e per unit)
const FACTORS = {
  transport: {
    car_petrol:    { label: "Car (Petrol)",      factor: 0.21,  unit: "km" },
    car_diesel:    { label: "Car (Diesel)",       factor: 0.17,  unit: "km" },
    bus:           { label: "Bus",                factor: 0.089, unit: "km" },
    train:         { label: "Train",              factor: 0.041, unit: "km" },
    auto:          { label: "Auto Rickshaw",      factor: 0.096, unit: "km" },
    bike:          { label: "Motorcycle",         factor: 0.114, unit: "km" },
    ev:            { label: "Electric Vehicle",   factor: 0.031, unit: "km" },
    flight_short:  { label: "Domestic Flight",    factor: 0.255, unit: "km" },
  },
  food: {
    meat_heavy:  { label: "Meat-heavy",    factor: 7.19 },
    mixed:       { label: "Mixed diet",    factor: 5.63 },
    vegetarian:  { label: "Vegetarian",   factor: 3.81 },
    vegan:       { label: "Vegan",         factor: 2.89 },
  },
  energy: {
    grid_india:  { label: "Indian Grid",    factor: 0.708 }, // kg/kWh
    solar:       { label: "Solar/Renew.",   factor: 0.041 },
    mixed_india: { label: "Mixed (India)",  factor: 0.420 },
  },
};

const INDIA_AVERAGE_KG_YEAR = 1800; // ~1.8 tCO2e per capita India 2023

function GaugeArc({ value, max, color }: { value: number; max: number; color: string }) {
  const r = 60;
  const circumference = Math.PI * r; // half circle
  const pct = Math.min(1, value / max);
  const dash = pct * circumference;
  return (
    <svg viewBox="0 0 140 80" className="w-full max-w-[220px]">
      <path d="M10 75 A60 60 0 0 1 130 75" fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth="12" strokeLinecap="round" />
      <motion.path
        d="M10 75 A60 60 0 0 1 130 75"
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${circumference}`}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference - dash }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
      <text x="70" y="65" textAnchor="middle" fill="white" fontSize="18" fontWeight="700" fontFamily="Inter, system-ui">
        {value < 1000 ? `${value.toFixed(0)}` : `${(value / 1000).toFixed(2)}t`}
      </text>
      <text x="70" y="80" textAnchor="middle" fill="#90a4c3" fontSize="9" fontFamily="Inter, system-ui">
        kg CO₂e / year
      </text>
    </svg>
  );
}

function ProjectionChart({
  current,
  projected,
  average,
  target,
}: {
  current: number;
  projected: number;
  average: number;
  target: number;
}) {
  const maxVal = Math.max(current, projected, average, target, 2000);
  const chartHeight = 110;
  
  const getBarHeight = (val: number) => (val / maxVal) * chartHeight;

  const data = [
    { label: "Current", value: current, color: "url(#cyanGlow)", border: "rgba(56,189,248,0.4)" },
    { label: "Projected", value: projected, color: "url(#greenGlow)", border: "rgba(74,222,128,0.4)" },
    { label: "India Avg", value: average, color: "url(#slateGlow)", border: "rgba(148,163,184,0.2)" },
    { label: "Target", value: target, color: "url(#emeraldGlow)", border: "rgba(16,185,129,0.3)" },
  ];

  return (
    <div className="panel subtle-ring p-5 bg-slate-900/60 backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">📊 Potential Footprint Savings</p>
      <p className="mt-1 text-[10px] text-slate-400">Comparing your custom savings projection (kg CO₂e/year)</p>
      
      <div className="mt-6 flex justify-center">
        <svg viewBox="0 0 320 180" className="w-full max-w-[280px]">
          <defs>
            <linearGradient id="cyanGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="greenGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#16a34a" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="slateGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#475569" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="emeraldGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#047857" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="30" y1="130" x2="310" y2="130" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
          <line x1="30" y1="75" x2="310" y2="75" stroke="rgba(148,163,184,0.06)" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="30" y1="20" x2="310" y2="20" stroke="rgba(148,163,184,0.06)" strokeWidth="1" strokeDasharray="3 3" />

          {data.map((item, index) => {
            const barW = 34;
            const gap = 36;
            const x = 36 + index * (barW + gap);
            const barH = getBarHeight(item.value);
            const y = 130 - barH;

            return (
              <g key={item.label}>
                {/* Neon shadow effect behind Projected */}
                {item.label === "Projected" && (
                  <rect
                    x={x - 3} y={y - 3} width={barW + 6} height={barH + 6}
                    rx="6" ry="6" fill="#4ade80" opacity="0.12" className="blur-[3px]"
                  />
                )}
                {/* The visual bar */}
                <rect
                  x={x} y={y} width={barW} height={barH} rx="5" ry="5"
                  fill={item.color} stroke={item.border} strokeWidth="1.5"
                />
                {/* Value text above bar */}
                <text
                  x={x + barW / 2} y={y - 8}
                  textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="Inter, system-ui"
                >
                  {item.value.toFixed(0)}
                </text>
                {/* Axis label */}
                <text
                  x={x + barW / 2} y="152"
                  textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="600" fontFamily="Inter, system-ui"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {current - projected > 0 && (
        <div className="mt-3.5 rounded-xl bg-emerald-500/10 p-3 ring-1 ring-emerald-400/20 text-center">
          <p className="text-[11px] leading-5 text-emerald-200">
            🌳 Activating committed goals cuts your footprint by{" "}
            <span className="font-bold text-white">{(current - projected).toFixed(0)} kg CO₂e/year</span> (
            <span className="font-bold text-white">-{((current - projected) / current * 100).toFixed(0)}%</span> reduction)!
          </p>
        </div>
      )}
    </div>
  );
}

type TransportKey = keyof typeof FACTORS.transport;
type FoodKey = keyof typeof FACTORS.food;
type EnergyKey = keyof typeof FACTORS.energy;

export function CarbonCalculator() {
  const [transportMode, setTransportMode] = useState<TransportKey>("car_petrol");
  const [transportKm, setTransportKm] = useState(20);
  const [foodType, setFoodType] = useState<FoodKey>("mixed");
  const [energyKwh, setEnergyKwh] = useState(150);
  const [energySource, setEnergySource] = useState<EnergyKey>("grid_india");

  // AI recommendations state
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<CarbonRecommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Persistent gamified action state
  const [commitments, setCommitments] = useState<CarbonRecommendation[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("eco_commitments");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [ecoPoints, setEcoPoints] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("eco_points");
      return saved ? Number(saved) : 0;
    }
    return 0;
  });

  const [accumulatedOffset, setAccumulatedOffset] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("eco_offset");
      return saved ? Number(saved) : 0;
    }
    return 0;
  });

  const [completedDaily, setCompletedDaily] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const savedDaily = localStorage.getItem("eco_daily_log");
      const savedDate = localStorage.getItem("eco_daily_date");
      const today = new Date().toDateString();
      if (savedDate === today && savedDaily) {
        return JSON.parse(savedDaily);
      }
    }
    return {};
  });

  // Initialize and check persistent daily calendar dates
  useEffect(() => {
    if (typeof window !== "undefined") {
      const today = new Date().toDateString();
      const savedDate = localStorage.getItem("eco_daily_date");
      if (savedDate !== today) {
        localStorage.setItem("eco_daily_date", today);
        localStorage.removeItem("eco_daily_log");
      }
    }
  }, []);

  const totals = useMemo(() => {
    const transport = transportKm * 365 * FACTORS.transport[transportMode].factor;
    const food = FACTORS.food[foodType].factor * 365;
    const energy = energyKwh * 12 * FACTORS.energy[energySource].factor;
    const total = transport + food + energy;
    return { transport, food, energy, total };
  }, [transportMode, transportKm, foodType, energyKwh, energySource]);

  const parseImpactKg = (impactStr: string): number => {
    const match = impactStr.match(/-?(\d+)/);
    return match ? Number(match[1]) : 350;
  };

  const committedSavings = useMemo(() => {
    return commitments.reduce((sum, c) => sum + parseImpactKg(c.impact), 0);
  }, [commitments]);

  const projectedFootprint = Math.max(0, totals.total - committedSavings);

  const color = totals.total < INDIA_AVERAGE_KG_YEAR ? "#4ade80" : totals.total < INDIA_AVERAGE_KG_YEAR * 1.5 ? "#fcd34d" : "#fb7185";
  const vsAvg = ((totals.total - INDIA_AVERAGE_KG_YEAR) / INDIA_AVERAGE_KG_YEAR * 100).toFixed(1);
  const isAbove = totals.total > INDIA_AVERAGE_KG_YEAR;

  const copyResult = () => {
    const text = `My carbon footprint: ${totals.total.toFixed(0)} kg CO₂e/year (${isAbove ? "+" : ""}${vsAvg}% vs India avg). Measured via EcoSentinel.`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const fetchRecommendations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ecoApi.getCarbonRecommendations({
        transport: transportMode,
        transport_km: transportKm,
        food: foodType,
        energy_kwh: energyKwh,
        energy_source: energySource,
      });
      setRecommendations(res.tips);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch carbon advisor metrics.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = (tip: CarbonRecommendation) => {
    if (commitments.some((c) => c.title === tip.title)) return;
    const newCommitments = [...commitments, tip];
    setCommitments(newCommitments);
    localStorage.setItem("eco_commitments", JSON.stringify(newCommitments));
  };

  const handleRemoveCommitment = (title: string) => {
    const newCommitments = commitments.filter((c) => c.title !== title);
    setCommitments(newCommitments);
    localStorage.setItem("eco_commitments", JSON.stringify(newCommitments));

    const newDaily = { ...completedDaily };
    delete newDaily[title];
    setCompletedDaily(newDaily);
    localStorage.setItem("eco_daily_log", JSON.stringify(newDaily));
  };

  const toggleDailyAction = (title: string, impactStr: string) => {
    const isDone = completedDaily[title];
    const newCompleted = { ...completedDaily, [title]: !isDone };
    setCompletedDaily(newCompleted);
    localStorage.setItem("eco_daily_log", JSON.stringify(newCompleted));

    const impactYearly = parseImpactKg(impactStr);
    const impactDaily = impactYearly / 365;

    const pointsDelta = isDone ? -25 : 25;
    const offsetDelta = isDone ? -impactDaily : impactDaily;

    const newPoints = Math.max(0, ecoPoints + pointsDelta);
    const newOffset = Math.max(0, accumulatedOffset + offsetDelta);

    setEcoPoints(newPoints);
    setAccumulatedOffset(newOffset);

    localStorage.setItem("eco_points", String(newPoints));
    localStorage.setItem("eco_offset", String(newOffset));
  };

  const resetAllProgress = () => {
    setCommitments([]);
    setEcoPoints(0);
    setAccumulatedOffset(0);
    setCompletedDaily({});
    localStorage.removeItem("eco_commitments");
    localStorage.removeItem("eco_points");
    localStorage.removeItem("eco_offset");
    localStorage.removeItem("eco_daily_log");
  };

  return (
    <section className="grid gap-6 xl:grid-cols-[1fr_minmax(0,0.85fr)]">
      {/* Inputs Column */}
      <div className="space-y-6">
        <div className="panel subtle-ring overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-200/70">Carbon Calculator</p>
            <h2 className="mt-1.5 text-xl font-semibold text-white">Estimate your personal CO₂ footprint</h2>
            <p className="mt-1 text-xs text-slate-400">Based on IPCC 2023 emission factors · India context</p>
          </div>

          <div className="space-y-7 p-6">
            {/* Transport */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300/80">🚗 Daily Transport</p>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.entries(FACTORS.transport) as [TransportKey, { label: string }][]).map(([key, { label }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTransportMode(key)}
                    className={`rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                      transportMode === key
                        ? "bg-sky-400/15 text-sky-200 ring-1 ring-sky-400/40"
                        : "bg-slate-950/40 text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="block text-xs text-slate-400 mb-2">
                Daily distance: <span className="text-white font-medium">{transportKm} km</span>
              </label>
              <input
                type="range" min={0} max={200} step={5}
                value={transportKm}
                onChange={(e) => setTransportKm(Number(e.target.value))}
                className="w-full accent-sky-400"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-600">
                <span>0 km</span><span>200 km</span>
              </div>
            </div>

            {/* Food */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">🥗 Diet Type</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.entries(FACTORS.food) as [FoodKey, { label: string }][]).map(([key, { label }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFoodType(key)}
                    className={`rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                      foodType === key
                        ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/40"
                        : "bg-slate-950/40 text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Energy */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">⚡ Monthly Energy Use</p>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {(Object.entries(FACTORS.energy) as [EnergyKey, { label: string }][]).map(([key, { label }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setEnergySource(key)}
                    className={`rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                      energySource === key
                        ? "bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/40"
                        : "bg-slate-950/40 text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="block text-xs text-slate-400 mb-2">
                Monthly kWh: <span className="text-white font-medium">{energyKwh} kWh</span>
              </label>
              <input
                type="range" min={0} max={500} step={10}
                value={energyKwh}
                onChange={(e) => setEnergyKwh(Number(e.target.value))}
                className="w-full accent-amber-400"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-600">
                <span>0 kWh</span><span>500 kWh</span>
              </div>
            </div>
          </div>

          <div className="border-t border-border px-6 py-5 flex items-center justify-between gap-4 bg-slate-950/20">
            <p className="text-xs text-slate-400">Unlock a custom environmental plan backed by Gemini AI.</p>
            <button
              type="button"
              disabled={loading}
              onClick={fetchRecommendations}
              className="btn-premium whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                  Generating...
                </span>
              ) : (
                "🧠 Generate AI Action Plan"
              )}
            </button>
          </div>
        </div>

        {/* AI Recommendations Panel */}
        <AnimatePresence mode="wait">
          {(recommendations || error) && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="panel subtle-ring p-6 bg-slate-900/40 backdrop-blur-xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-md font-semibold text-white">✨ Recommended Actions from Gemini</h3>
                  <p className="text-xs text-slate-400">Based on your daily mobility, diet, and utility stats</p>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-rose-500/10 p-4 ring-1 ring-rose-500/20">
                  <p className="text-xs text-rose-300">⚠️ {error}</p>
                </div>
              )}

              {recommendations && (
                <div className="space-y-4">
                  {recommendations.map((tip, idx) => {
                    const alreadyCommitted = commitments.some((c) => c.title === tip.title);
                    return (
                      <div
                        key={`tip-${idx}`}
                        className="group flex flex-col justify-between gap-4 rounded-2xl bg-slate-950/40 p-4 ring-1 ring-white/5 transition hover:ring-white/10 sm:flex-row sm:items-center"
                      >
                        <div className="space-y-1 sm:max-w-[70%]">
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                              {tip.impact}
                            </span>
                            <h4 className="text-sm font-semibold text-white group-hover:text-emerald-300 transition">
                              {tip.title}
                            </h4>
                          </div>
                          <p className="text-xs leading-5 text-slate-400">{tip.description}</p>
                        </div>
                        <button
                          type="button"
                          disabled={alreadyCommitted}
                          onClick={() => handleCommit(tip)}
                          className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                            alreadyCommitted
                              ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                              : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                          }`}
                        >
                          {alreadyCommitted ? "✓ Committed" : "🎯 Commit to Goal"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gamified Environmental Action Center */}
        <div className="panel subtle-ring p-6 bg-slate-900/40 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />
          <div className="absolute left-0 bottom-0 h-40 w-40 rounded-full bg-sky-500/5 blur-3xl pointer-events-none" />

          <div className="flex flex-col justify-between border-b border-border pb-4 sm:flex-row sm:items-center gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-300/80">🏆 Environmental Action Center</p>
              <h3 className="mt-1.5 text-md font-semibold text-white">Your Daily Goals & Progress Tracker</h3>
            </div>
            {commitments.length > 0 && (
              <button
                type="button"
                onClick={resetAllProgress}
                className="text-[10px] font-semibold tracking-wider text-slate-500 hover:text-rose-400 transition uppercase"
              >
                Reset All Progress
              </button>
            )}
          </div>

          {/* Gamified stats dashboard */}
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-slate-950/60 p-4 text-center ring-1 ring-white/5 relative">
              <span className="absolute left-1/2 top-3 h-2 w-16 -translate-x-1/2 rounded-full bg-emerald-500/10" />
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-2">Gamified Points</p>
              <p className="mt-1 text-2xl font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.2)]">
                {ecoPoints} <span className="text-xs font-semibold text-emerald-300/60">XP</span>
              </p>
            </div>
            <div className="rounded-2xl bg-slate-950/60 p-4 text-center ring-1 ring-white/5 relative">
              <span className="absolute left-1/2 top-3 h-2 w-16 -translate-x-1/2 rounded-full bg-sky-500/10" />
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-2">Active CO₂ Offsets</p>
              <p className="mt-1 text-2xl font-bold text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.2)]">
                {accumulatedOffset.toFixed(2)} <span className="text-xs font-semibold text-sky-300/60">kg</span>
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {commitments.length === 0 ? (
              <div className="py-8 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-400">
                  🌱
                </div>
                <h4 className="mt-3 text-xs font-semibold text-white">No active environmental goals committed yet</h4>
                <p className="mx-auto mt-1 max-w-[280px] text-[11px] leading-5 text-slate-500">
                  Generate your custom AI Action Plan above and click &quot;Commit to Goal&quot; to populate your active tasks list.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                <p className="text-xs font-semibold text-slate-300">🎯 Daily Challenges Checklist (earn 25 XP per challenge)</p>
                {commitments.map((goal, idx) => {
                  const isDone = !!completedDaily[goal.title];
                  return (
                    <div
                      key={`commitment-${idx}`}
                      className={`flex items-start justify-between gap-4 rounded-xl bg-slate-950/30 p-4 ring-1 transition ${
                        isDone ? "ring-emerald-500/20 bg-emerald-500/5" : "ring-white/5 hover:ring-white/10"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          id={`chk-${idx}`}
                          checked={isDone}
                          onChange={() => toggleDailyAction(goal.title, goal.impact)}
                          className="mt-1 h-4.5 w-4.5 rounded border-slate-700 bg-slate-950 text-emerald-400 accent-emerald-400 transition pointer-events-auto cursor-pointer"
                        />
                        <div className="space-y-0.5">
                          <label
                            htmlFor={`chk-${idx}`}
                            className={`text-xs font-semibold select-none cursor-pointer ${
                              isDone ? "text-slate-400 line-through" : "text-white"
                            }`}
                          >
                            {goal.title}
                          </label>
                          <p className="text-[10px] text-slate-500 leading-4">{goal.description}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 whitespace-nowrap">
                        <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold text-sky-300">
                          {goal.impact}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCommitment(goal.title)}
                          className="text-[9px] font-semibold text-slate-600 hover:text-rose-400 transition"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results Column */}
      <div className="space-y-5">
        <div className="panel subtle-ring overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Your Footprint</p>
            <h2 className="mt-1.5 text-xl font-semibold text-white">Annual CO₂ estimate</h2>
          </div>
          <div className="flex flex-col items-center gap-2 p-6 bg-slate-950/10">
            <GaugeArc value={totals.total} max={INDIA_AVERAGE_KG_YEAR * 3} color={color} />
            <motion.p key={totals.total.toFixed(0)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-sm font-semibold" style={{ color }}>
              {isAbove ? `+${vsAvg}%` : `${vsAvg}%`} vs India average ({(INDIA_AVERAGE_KG_YEAR / 1000).toFixed(1)} t)
            </motion.p>
          </div>

          {/* Breakdown bars */}
          <div className="space-y-3 px-6 pb-6">
            {[
              { label: "Transport", value: totals.transport, color: "#38bdf8", icon: "🚗" },
              { label: "Food",      value: totals.food,      color: "#4ade80", icon: "🥗" },
              { label: "Energy",    value: totals.energy,    color: "#fcd34d", icon: "⚡" },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-400">{row.icon} {row.label}</span>
                  <span className="font-semibold text-white">{row.value.toFixed(0)} kg</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <motion.div
                    className="h-2 rounded-full"
                    style={{ backgroundColor: row.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (row.value / totals.total) * 100)}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border px-6 pb-5 pt-4 bg-slate-950/20">
            <button
              type="button"
              onClick={copyResult}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              📋 Copy my result
            </button>
          </div>
        </div>

        {/* SVG Projection Chart (Integrated) */}
        <ProjectionChart
          current={totals.total}
          projected={projectedFootprint}
          average={INDIA_AVERAGE_KG_YEAR}
          target={1200}
        />

        {/* Static carbon context tips */}
        <div className="panel subtle-ring p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">💡 General Reduction Tip</p>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {transportMode === "car_petrol" || transportMode === "car_diesel"
              ? "Switching to an EV or bus for daily commutes could cut your transport emissions by up to 70%."
              : foodType === "meat_heavy"
              ? "Reducing meat consumption to a mixed diet could save ~1.3 tCO₂e per year."
              : energySource === "grid_india"
              ? "Installing rooftop solar panels can reduce your energy footprint by ~95%."
              : "Great choices! Your footprint is below the Indian average — share your habits to inspire others."}
          </p>
        </div>
      </div>
    </section>
  );
}
