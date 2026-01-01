/**
 * Simulation Engine Configuration
 * Controls how the banking simulation operates
 */

export type SimulationMode = "deterministic" | "random";
export type ChaosMode =
  | "normal"
  | "latency"
  | "flaky"
  | "maintenance"
  | "corrupt";

export interface TimeWindow {
  name: string;
  startHour: number;
  endHour: number;
  activityMultiplier: number;
}

export interface SimulationConfig {
  // Core settings
  mode: SimulationMode;
  seedKey: string;
  intervalMs: number; // How often simulation runs

  // Time behavior
  timeWindows: TimeWindow[];
  weekendMultiplier: number;

  // Transaction lifecycle
  pendingDurationMs: number; // How long before auto-posting
  cancelRate: number; // Percentage of transactions that get canceled
  amountChangeRate: number; // Percentage of transactions with final amount change
  maxAmountChangePercent: number; // Max percentage the amount can change

  // Bank rules
  defaultDailyLimit: number; // Default daily spending limit in cents
  overdraftFee: number; // Fee for overdraft in cents
  maxOverdraftAmount: number; // Maximum overdraft allowed in cents

  // Chaos settings
  chaosMode: ChaosMode;
  latencyMs: number;
  failureRate: number;
}

export const TIME_WINDOWS: TimeWindow[] = [
  { name: "night", startHour: 0, endHour: 6, activityMultiplier: 0.1 },
  { name: "morning", startHour: 6, endHour: 12, activityMultiplier: 1.2 },
  { name: "afternoon", startHour: 12, endHour: 18, activityMultiplier: 1.5 },
  { name: "evening", startHour: 18, endHour: 22, activityMultiplier: 1.3 },
  { name: "late_night", startHour: 22, endHour: 24, activityMultiplier: 0.4 },
];

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  // Core settings
  mode: "random",
  seedKey: "simulation-2024",
  intervalMs: parseInterval(process.env.SIMULATION_INTERVAL || "1h"),

  // Time behavior
  timeWindows: TIME_WINDOWS,
  weekendMultiplier: 1.3,

  // Transaction lifecycle (realistic bank delays)
  pendingDurationMs: 2 * 60 * 60 * 1000, // 2 hours default
  cancelRate: 0.02, // 2% of transactions get canceled
  amountChangeRate: 0.05, // 5% of transactions have amount change (gas station style)
  maxAmountChangePercent: 20, // Up to 20% change in amount

  // Bank rules
  defaultDailyLimit: 500000, // $5,000 in cents
  overdraftFee: 3500, // $35 in cents
  maxOverdraftAmount: 50000, // $500 max overdraft

  // Chaos settings
  chaosMode: "normal",
  latencyMs: 0,
  failureRate: 0,
};

/**
 * Parse interval string to milliseconds
 * Supports: 1h, 30m, 1d, 1000 (raw ms)
 */
export function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!match) return 3600000; // Default 1 hour

  const value = parseInt(match[1] ?? "3600000", 10);
  const unit = match[2] || "ms";

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * (multipliers[unit] || 1);
}

/**
 * Get current time window based on hour
 */
export function getCurrentTimeWindow(hour: number): TimeWindow {
  for (const window of TIME_WINDOWS) {
    if (hour >= window.startHour && hour < window.endHour) {
      return window;
    }
  }
  return TIME_WINDOWS[0]!; // Default to night (guaranteed to exist)
}

/**
 * Parse simulation config from environment
 */
export function parseSimulationConfig(): SimulationConfig {
  const config = { ...DEFAULT_SIMULATION_CONFIG };

  // Override from environment
  if (process.env.SIMULATION_MODE) {
    config.mode = process.env.SIMULATION_MODE as SimulationMode;
  }

  if (process.env.SIMULATION_SEED) {
    config.seedKey = process.env.SIMULATION_SEED;
  }

  if (process.env.SIMULATION_INTERVAL) {
    config.intervalMs = parseInterval(process.env.SIMULATION_INTERVAL);
  }

  if (process.env.PENDING_DURATION_MS) {
    config.pendingDurationMs = parseInt(process.env.PENDING_DURATION_MS, 10);
  }

  if (process.env.DAILY_LIMIT) {
    config.defaultDailyLimit = parseInt(process.env.DAILY_LIMIT, 10);
  }

  return config;
}

// Singleton config instance
let currentConfig: SimulationConfig = parseSimulationConfig();

export function getSimulationConfig(): SimulationConfig {
  return currentConfig;
}

export function updateSimulationConfig(
  updates: Partial<SimulationConfig>,
): SimulationConfig {
  currentConfig = { ...currentConfig, ...updates };
  return currentConfig;
}

export function resetSimulationConfig(): SimulationConfig {
  currentConfig = parseSimulationConfig();
  return currentConfig;
}
