/**
 * Simulation Engine
 * Generates realistic banking activity based on personas
 * Runs as a background worker with configurable intervals
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '../core/logger.js';
import {
  getSimulationConfig,
  getCurrentTimeWindow,
  type SimulationConfig,
} from '../core/simulationConfig.js';
import { PERSONAS, type PersonaConfig, type PersonaType } from '../core/personas.js';
import { SeededRandom } from '../core/random.js';
import {
  getMerchantForCategory,
  getRandomCity,
  generateTransactionReference,
  generateDescription,
} from '../core/merchants.js';
import {
  createTransaction,
  processPendingTransactions,
} from '../core/transactionLifecycle.js';
import type { Category } from '../core/personas.js';

const prisma = new PrismaClient();
const logger = createLogger('SimulationEngine');

let simulationTimer: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Initialize or get simulation state
 */
async function getSimulationState() {
  let state = await prisma.simulationState.findUnique({
    where: { id: 'singleton' },
  });
  
  if (!state) {
    state = await prisma.simulationState.create({
      data: { id: 'singleton' },
    });
  }
  
  return state;
}

/**
 * Update simulation state
 */
async function updateSimulationState(data: {
  lastRunAt?: Date;
  transactionsToday?: number;
  failuresInjected?: number;
  currentMode?: string;
  isRunning?: boolean;
}) {
  await prisma.simulationState.update({
    where: { id: 'singleton' },
    data,
  });
}

/**
 * Check if it's a weekend
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Check if it's a payday
 */
function isPayday(date: Date, frequency: string): boolean {
  const dayOfMonth = date.getDate();
  const lastDayOfMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0
  ).getDate();

  if (frequency === 'monthly') {
    return dayOfMonth === lastDayOfMonth;
  } else if (frequency === 'biweekly') {
    return dayOfMonth === 15 || dayOfMonth === lastDayOfMonth;
  } else if (frequency === 'weekly') {
    return date.getDay() === 5; // Friday
  }
  return false;
}

/**
 * Check if it's rent day (usually 1st of month)
 */
function isRentDay(date: Date): boolean {
  return date.getDate() === 1;
}

/**
 * Generate transactions for a single account based on persona and current time
 */
async function generateAccountTransactions(
  account: any,
  rng: SeededRandom,
  config: SimulationConfig
): Promise<number> {
  const persona = PERSONAS[account.persona as PersonaType];
  if (!persona) return 0;
  
  const now = new Date();
  const hour = now.getHours();
  const timeWindow = getCurrentTimeWindow(hour);
  
  // Calculate activity multiplier
  let activityMultiplier = timeWindow.activityMultiplier;
  if (isWeekend(now)) {
    activityMultiplier *= config.weekendMultiplier * persona.weekendBehavior.multiplier;
  }
  
  // Base transaction probability per hour
  const hourlyFreq = (persona.transactionFrequency.min + persona.transactionFrequency.max) / 2 / 168; // Per week to per hour
  const adjustedFreq = hourlyFreq * activityMultiplier;
  
  // Determine number of transactions to generate
  const numTransactions = Math.round(adjustedFreq + (rng.next() - 0.5) * 2);
  
  let transactionsCreated = 0;
  
  // Generate income if it's payday
  if (isPayday(now, persona.incomePattern.frequency)) {
    const amount = rng.nextWithVariance(
      persona.incomePattern.baseAmount,
      persona.incomePattern.variance
    );
    
    const category: Category = 'salary';
    const merchant = getMerchantForCategory(category, () => rng.next());
    
    const result = await createTransaction({
      accountId: account.id,
      type: 'credit',
      amount,
      category,
      merchant,
      location: getRandomCity(() => rng.next()),
      reference: generateTransactionReference(() => rng.next()),
      description: generateDescription('credit', category, merchant),
    });
    
    if (result.success) transactionsCreated++;
  }
  
  // Generate rent payment if it's rent day and persona pays rent
  if (isRentDay(now) && persona.categoryWeights.some(w => w.category === 'rent')) {
    const rentWeight = persona.categoryWeights.find(w => w.category === 'rent');
    if (rentWeight && rng.next() < 0.9) { // 90% chance to pay rent
      const category: Category = 'rent';
      const merchant = getMerchantForCategory(category, () => rng.next());
      const amount = rng.nextWithVariance(120000, 20); // ~$1200 ± 20%
      
      const result = await createTransaction({
        accountId: account.id,
        type: 'debit',
        amount,
        category,
        merchant,
        location: getRandomCity(() => rng.next()),
        reference: generateTransactionReference(() => rng.next()),
        description: generateDescription('debit', category, merchant),
      });
      
      if (result.success) transactionsCreated++;
    }
  }
  
  // Generate regular transactions
  for (let i = 0; i < numTransactions; i++) {
    // Select category based on weights
    const category = rng.pickWeighted(persona.categoryWeights).category as Category;
    
    // Generate amount
    let amount = rng.nextWithVariance(
      persona.transactionAmount.average,
      persona.transactionAmount.variance
    );
    amount = Math.max(100, amount); // At least $1
    
    const merchant = getMerchantForCategory(category, () => rng.next());
    
    const result = await createTransaction({
      accountId: account.id,
      type: 'debit',
      amount,
      category,
      merchant,
      location: getRandomCity(() => rng.next()),
      reference: generateTransactionReference(() => rng.next()),
      description: generateDescription('debit', category, merchant),
    });
    
    if (result.success) transactionsCreated++;
  }
  
  return transactionsCreated;
}

/**
 * Run a single simulation cycle
 */
export async function runSimulationCycle(): Promise<{
  transactionsGenerated: number;
  pendingProcessed: { posted: number; canceled: number; amountChanged: number };
  accountsProcessed: number;
}> {
  const config = getSimulationConfig();
  const startTime = Date.now();
  
  logger.info('Starting simulation cycle', {
    mode: config.mode,
    chaosMode: config.chaosMode,
  });
  
  await updateSimulationState({ isRunning: true });
  
  try {
    // Get seed for this cycle
    const cycleSeed = config.mode === 'deterministic'
      ? `${config.seedKey}-${new Date().toISOString().split('T')[0]}`
      : Date.now();
    const rng = new SeededRandom(cycleSeed);
    
    // Get all active accounts (not frozen)
    const accounts = await prisma.account.findMany({
      where: { frozen: false },
      include: { user: true },
    });
    
    let totalTransactions = 0;
    
    // Generate transactions for each account
    for (const account of accounts) {
      const generated = await generateAccountTransactions(account, rng, config);
      totalTransactions += generated;
    }
    
    // Process pending transactions (auto-post/cancel)
    const pendingResults = await processPendingTransactions();
    
    // Reset transactions today counter if it's a new day
    const state = await getSimulationState();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const lastRunDate = state.lastRunAt ? new Date(state.lastRunAt) : null;
    const isNewDay = !lastRunDate || lastRunDate < today;
    
    await updateSimulationState({
      lastRunAt: new Date(),
      transactionsToday: isNewDay ? totalTransactions : state.transactionsToday + totalTransactions,
      isRunning: false,
    });
    
    const duration = Date.now() - startTime;
    logger.info('Simulation cycle complete', {
      duration: `${duration}ms`,
      transactionsGenerated: totalTransactions,
      accountsProcessed: accounts.length,
      pendingPosted: pendingResults.posted,
      pendingCanceled: pendingResults.canceled,
    });
    
    return {
      transactionsGenerated: totalTransactions,
      pendingProcessed: pendingResults,
      accountsProcessed: accounts.length,
    };
  } catch (error) {
    logger.error('Simulation cycle failed', error);
    await updateSimulationState({ isRunning: false });
    throw error;
  }
}

/**
 * Start the simulation engine
 */
export async function startSimulation(): Promise<void> {
  if (isRunning) {
    logger.warn('Simulation already running');
    return;
  }
  
  const config = getSimulationConfig();
  isRunning = true;
  
  logger.section('Starting Simulation Engine');
  logger.info('Configuration', {
    mode: config.mode,
    interval: `${config.intervalMs}ms`,
    pendingDuration: `${config.pendingDurationMs}ms`,
    chaosMode: config.chaosMode,
  });
  
  // Run initial cycle
  await runSimulationCycle();
  
  // Schedule recurring cycles
  simulationTimer = setInterval(async () => {
    try {
      await runSimulationCycle();
    } catch (error) {
      logger.error('Scheduled simulation cycle failed', error);
    }
  }, config.intervalMs);
  
  await updateSimulationState({ currentMode: config.mode });
}

/**
 * Stop the simulation engine
 */
export function stopSimulation(): void {
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }
  isRunning = false;
  logger.info('Simulation engine stopped');
}

/**
 * Check if simulation is currently running
 */
export function isSimulationRunning(): boolean {
  return isRunning;
}

/**
 * Get simulation stats
 */
export async function getSimulationStats(): Promise<{
  isRunning: boolean;
  lastRunAt: Date | null;
  transactionsToday: number;
  failuresInjected: number;
  currentMode: string;
}> {
  const state = await getSimulationState();
  return {
    isRunning,
    lastRunAt: state.lastRunAt,
    transactionsToday: state.transactionsToday,
    failuresInjected: state.failuresInjected,
    currentMode: state.currentMode,
  };
}

/**
 * Manually trigger a simulation cycle
 */
export async function triggerSimulationCycle(): Promise<{
  transactionsGenerated: number;
  pendingProcessed: { posted: number; canceled: number; amountChanged: number };
  accountsProcessed: number;
}> {
  logger.info('Manual simulation trigger');
  return runSimulationCycle();
}
