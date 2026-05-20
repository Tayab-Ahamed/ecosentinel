"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";

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

type TransportKey = keyof typeof FACTORS.transport;
type FoodKey = keyof typeof FACTORS.food;
type EnergyKey = keyof typeof FACTORS.energy;

export function CarbonCalculator() {
  const [transportMode, setTransportMode] = useState<TransportKey>("car_petrol");
  const [transportKm, setTransportKm] = useState(20);
  const [foodType, setFoodType] = useState<FoodKey>("mixed");
  const [energyKwh, setEnergyKwh] = useState(150);
  const [energySource, setEnergySource] = useState<EnergyKey>("grid_india");

  const totals = useMemo(() => {
    const transport = transportKm * 365 * FACTORS.transport[transportMode].factor;
    const food = FACTORS.food[foodType].factor * 365;
    const energy = energyKwh * 12 * FACTORS.energy[energySource].factor;
    const total = transport + food + energy;
    return { transport, food, energy, total };
  }, [transportMode, transportKm, foodType, energyKwh, energySource]);

  const color = totals.total < INDIA_AVERAGE_KG_YEAR ? "#4ade80" : totals.total < INDIA_AVERAGE_KG_YEAR * 1.5 ? "#fcd34d" : "#fb7185";
  const vsAvg = ((totals.total - INDIA_AVERAGE_KG_YEAR) / INDIA_AVERAGE_KG_YEAR * 100).toFixed(1);
  const isAbove = totals.total > INDIA_AVERAGE_KG_YEAR;

  const copyResult = () => {
    const text = `My carbon footprint: ${totals.total.toFixed(0)} kg CO₂e/year (${isAbove ? "+" : ""}${vsAvg}% vs India avg). Measured via EcoSentinel.`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <section className="grid gap-6 xl:grid-cols-[1fr_minmax(0,0.85fr)]">
      {/* Inputs */}
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
      </div>

      {/* Results */}
      <div className="space-y-5">
        <div className="panel subtle-ring overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Your Footprint</p>
            <h2 className="mt-1.5 text-xl font-semibold text-white">Annual CO₂ estimate</h2>
          </div>
          <div className="flex flex-col items-center gap-2 p-6">
            <GaugeArc value={totals.total} max={INDIA_AVERAGE_KG_YEAR * 3} color={color} />
            <motion.p key={totals.total.toFixed(0)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-sm font-medium" style={{ color }}>
              {isAbove ? `+${vsAvg}%` : `${vsAvg}%`} vs India average ({(INDIA_AVERAGE_KG_YEAR / 1000).toFixed(1)} t)
            </motion.p>
          </div>

          {/* Breakdown */}
          <div className="space-y-3 px-6 pb-6">
            {[
              { label: "Transport", value: totals.transport, color: "#38bdf8", icon: "🚗" },
              { label: "Food",      value: totals.food,      color: "#4ade80", icon: "🥗" },
              { label: "Energy",    value: totals.energy,    color: "#fcd34d", icon: "⚡" },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-slate-400">{row.icon} {row.label}</span>
                  <span className="font-medium text-white">{row.value.toFixed(0)} kg</span>
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

          <div className="border-t border-border px-6 pb-5 pt-4">
            <button
              type="button"
              onClick={copyResult}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              📋 Copy my result
            </button>
          </div>
        </div>

        {/* Tip card */}
        <div className="panel subtle-ring p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">💡 Top Reduction Tip</p>
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
