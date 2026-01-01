/**
 * Simulation Engine
 * Generates realistic banking activity based on personas
 * Runs as a background worker with configurable intervals
 * 
 * Phase 4: Full Banking Simulation with:
 * - Transaction generation & lifecycle
 * - Fraud detection & alerts
 * - Risk scoring & monitoring
 * - Loan payments & defaults
 * - Market price updates & portfolio revaluation
 * - Compliance checks (KYC expiry, AML monitoring)
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '../core/logger.js';
import {
  getSimulationConfig,
  getCurrentTimeWindow,
  type SimulationConfig,
} from '../core/simulationConfig.js';
import { PERSONAS, type PersonaType } from '../core/personas.js';
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

// Phase 4 Engine Imports
import { analyzeTransaction as analyzeFraud, createFraudAlert } from '../engines/fraud.js';
import { calculateUserRiskScore, logRiskEvent } from '../engines/risk.js';
import { processLoanPayments, processLoanDefaults } from '../engines/loans.js';
import { updateMarketPrices, updateAllPortfolioValues } from '../engines/investment.js';
import { runScheduledComplianceChecks, analyzeTransactionAML } from '../engines/compliance.js';

const prisma = new PrismaClient();
const logger = createLogger('SimulationEngine');

let simulationTimer: NodeJS.Timeout | null = null;
let dailyTasksTimer: NodeJS.Timeout | null = null;
let marketTimer: NodeJS.Timeout | null = null;
let isRunning = false;
let lastDayProcessed: string | null = null;

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
 * Analyze a transaction for fraud and risk (Phase 4)
 */
async function analyzeTransactionForFraudAndRisk(
  transaction: any,
  account: any,
  _rng: SeededRandom
): Promise<void> {
  // Skip small transactions to reduce noise
  if (transaction.amount < 5000) return; // Skip under $50
  
  try {
    // Fraud analysis using TransactionContext
    const fraudResult = await analyzeFraud({
      accountId: account.id,
      type: transaction.type,
      amount: transaction.amount,
      category: transaction.category,
      merchant: transaction.merchant,
      location: transaction.location,
      timestamp: transaction.createdAt,
    });
    
    if (fraudResult.isFraudulent || fraudResult.alerts.length > 0) {
      // Determine severity from alerts
      const hasCritical = fraudResult.alerts.some(a => a.severity === 'critical');
      const hasHigh = fraudResult.alerts.some(a => a.severity === 'high');
      const severity = hasCritical ? 'critical' : hasHigh ? 'high' : 'medium';
      const alertType = fraudResult.alerts[0]?.type || 'suspicious_activity';
      const reason = fraudResult.alerts[0]?.reason || 'Automated fraud detection flagged this transaction';
      
      // Create fraud alert
      await createFraudAlert(
        account.userId,
        alertType as any,
        severity as any,
        reason,
        { transactionId: transaction.id, score: fraudResult.score, alerts: fraudResult.alerts },
        transaction.id
      );
      
      // Log risk event
      await logRiskEvent(
        account.userId,
        'fraud_alert',
        severity === 'critical' ? 'critical' : 'high',
        `Fraud detected: ${reason}`,
        { transactionId: transaction.id }
      );
      
      logger.warn('Fraud detected', {
        transactionId: transaction.id,
        userId: account.userId,
        type: alertType,
        severity,
        score: fraudResult.score,
      });
      
      // Flag the transaction
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { fraudFlag: true },
      });
    }
    
    // AML analysis for large transactions
    if (transaction.amount >= 100000) { // $1000+
      const amlResult = await analyzeTransactionAML(account.userId, transaction.amount);
      if (amlResult.flagged) {
        logger.warn('AML flags raised', {
          userId: account.userId,
          flags: amlResult.flags,
        });
      }
    }
  } catch (error) {
    logger.error('Fraud/Risk analysis failed', error);
  }
}

/**
 * Process daily banking tasks (runs once per simulated day)
 */
async function processDailyBankingTasks(): Promise<{
  loansProcessed: number;
  paymentsCollected: number;
  defaultsDetected: number;
  complianceChecks: { kycExpired: number; sanctionRescreen: number; amlReviewed: number };
  riskScoresUpdated: number;
}> {
  logger.section('Processing Daily Banking Tasks');
  
  const results = {
    loansProcessed: 0,
    paymentsCollected: 0,
    defaultsDetected: 0,
    complianceChecks: { kycExpired: 0, sanctionRescreen: 0, amlReviewed: 0 },
    riskScoresUpdated: 0,
  };
  
  try {
    // 1. Process loan payments due today
    logger.subsection('Processing Loan Payments');
    const paymentResult = await processLoanPayments();
    results.paymentsCollected = paymentResult.processed;
    results.loansProcessed = paymentResult.processed;
    logger.info('Loan payments processed', paymentResult);
    
    // 2. Check for loan defaults (missed payments)
    logger.subsection('Checking Loan Defaults');
    const defaultResult = await processLoanDefaults();
    results.defaultsDetected = defaultResult.defaulted;
    logger.info('Loan defaults processed', defaultResult);
    
    // 3. Run compliance checks
    logger.subsection('Running Compliance Checks');
    results.complianceChecks = await runScheduledComplianceChecks();
    logger.info('Compliance checks complete', results.complianceChecks);
    
    // 4. Update risk scores for all users
    logger.subsection('Updating Risk Scores');
    const users = await prisma.user.findMany({ select: { id: true } });
    for (const user of users) {
      try {
        await calculateUserRiskScore(user.id);
        results.riskScoresUpdated++;
      } catch (e) {
        // Skip individual failures
      }
    }
    logger.info('Risk scores updated', { count: results.riskScoresUpdated });
    
  } catch (error) {
    logger.error('Daily banking tasks failed', error);
  }
  
  return results;
}

/**
 * Update market prices and portfolio values (runs periodically)
 */
async function processMarketUpdates(rng: SeededRandom): Promise<{
  assetsUpdated: number;
  portfoliosRevalued: number;
  marketTrend: string;
}> {
  const results = {
    assetsUpdated: 0,
    portfoliosRevalued: 0,
    marketTrend: 'stable',
  };
  
  try {
    // Update market prices with realistic volatility
    const seed = Math.floor(rng.next() * 1000000);
    const volatilityMultiplier = 0.8 + rng.next() * 0.4; // 0.8 - 1.2x normal volatility
    
    const marketResult = await updateMarketPrices(seed, volatilityMultiplier);
    results.assetsUpdated = marketResult.updated;
    results.marketTrend = marketResult.avgChange > 0.01 ? 'bullish' : 
                          marketResult.avgChange < -0.01 ? 'bearish' : 'stable';
    
    // Revalue all portfolios
    const portfolioResult = await updateAllPortfolioValues();
    results.portfoliosRevalued = portfolioResult.updated;
    
    logger.info('Market update complete', results);
  } catch (error) {
    logger.error('Market update failed', error);
  }
  
  return results;
}

/**
 * Check for and trigger random events (fraud attempts, market events)
 */
async function checkForRandomEvents(rng: SeededRandom): Promise<void> {
  const state = await getSimulationState();
  
  // Random fraud attempt (0.5% chance per cycle)
  if (rng.next() < 0.005 && !state.fraudEventActive) {
    logger.warn('Random fraud event triggered by simulation');
    
    // Pick a random user
    const users = await prisma.user.findMany({
      where: { persona: { in: ['spender', 'investor'] } },
      take: 5,
    });
    
    if (users.length > 0) {
      const targetUser = users[Math.floor(rng.next() * users.length)];
      if (targetUser) {
        await createFraudAlert(
          targetUser.id,
          'suspicious_activity',
          'high',
          'Unusual account access pattern detected',
          { source: 'auto_simulation', timestamp: new Date().toISOString() }
        );
        
        await logRiskEvent(
          targetUser.id,
          'suspicious_login',
          'high',
          'Simulated suspicious activity detected'
        );
      }
    }
  }
  
  // Market volatility spike (1% chance per cycle during market hours)
  const hour = new Date().getHours();
  if (hour >= 9 && hour <= 16 && rng.next() < 0.01 && !state.marketCrashActive) {
    logger.warn('Market volatility spike triggered by simulation');
    
    // Small market movement
    const seed = Math.floor(rng.next() * 1000000);
    await updateMarketPrices(seed, 2.0); // Double volatility
  }
}

/**
 * Run a single simulation cycle
 */
export async function runSimulationCycle(): Promise<{
  transactionsGenerated: number;
  pendingProcessed: { posted: number; canceled: number; amountChanged: number };
  accountsProcessed: number;
  phase4: {
    fraudAlertsCreated: number;
    marketUpdated: boolean;
    dailyTasksRun: boolean;
  };
}> {
  const config = getSimulationConfig();
  const startTime = Date.now();
  
  logger.info('Starting simulation cycle', {
    mode: config.mode,
    chaosMode: config.chaosMode,
  });
  
  await updateSimulationState({ isRunning: true });
  
  const phase4Results = {
    fraudAlertsCreated: 0,
    marketUpdated: false,
    dailyTasksRun: false,
  };
  
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
      
      // Phase 4: Analyze recent transactions for fraud/risk
      if (generated > 0) {
        const recentTransactions = await prisma.transaction.findMany({
          where: { accountId: account.id },
          orderBy: { createdAt: 'desc' },
          take: generated,
        });
        
        for (const txn of recentTransactions) {
          await analyzeTransactionForFraudAndRisk(txn, account, rng);
        }
      }
    }
    
    // Process pending transactions (auto-post/cancel)
    const pendingResults = await processPendingTransactions();
    
    // Phase 4: Check for random events
    await checkForRandomEvents(rng);
    
    // Phase 4: Update market prices (every cycle)
    const marketResult = await processMarketUpdates(rng);
    phase4Results.marketUpdated = marketResult.assetsUpdated > 0;
    
    // Phase 4: Check if we need to run daily tasks
    const today = new Date().toISOString().split('T')[0] ?? '';
    if (today !== lastDayProcessed) {
      logger.section('New Day Detected - Running Daily Tasks');
      await processDailyBankingTasks();
      lastDayProcessed = today;
      phase4Results.dailyTasksRun = true;
      
      // Advance simulation day counter (currentDay is a DateTime, so set to new Date)
      await prisma.simulationState.update({
        where: { id: 'singleton' },
        data: { currentDay: new Date() },
      });
    }
    
    // Reset transactions today counter if it's a new day
    const state = await getSimulationState();
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    const lastRunDate = state.lastRunAt ? new Date(state.lastRunAt) : null;
    const isNewDay = !lastRunDate || lastRunDate < todayDate;
    
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
      phase4: phase4Results,
    });
    
    return {
      transactionsGenerated: totalTransactions,
      pendingProcessed: pendingResults,
      accountsProcessed: accounts.length,
      phase4: phase4Results,
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
  
  logger.section('Starting Full Banking Simulation Engine (Phase 4)');
  logger.info('Configuration', {
    mode: config.mode,
    interval: `${config.intervalMs}ms`,
    pendingDuration: `${config.pendingDurationMs}ms`,
    chaosMode: config.chaosMode,
  });
  
  logger.info('Phase 4 Features Enabled', {
    fraudDetection: true,
    riskScoring: true,
    loanProcessing: true,
    marketSimulation: true,
    complianceMonitoring: true,
  });
  
  // Initialize today tracker
  lastDayProcessed = new Date().toISOString().split('T')[0] ?? '';
  
  // Run initial cycle
  await runSimulationCycle();
  
  // Schedule recurring cycles (main transaction generation)
  simulationTimer = setInterval(async () => {
    try {
      await runSimulationCycle();
    } catch (error) {
      logger.error('Scheduled simulation cycle failed', error);
    }
  }, config.intervalMs);
  
  await updateSimulationState({ currentMode: config.mode });
  
  logger.success('Simulation engine started - Bank is now fully operational');
}

/**
 * Stop the simulation engine
 */
export function stopSimulation(): void {
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }
  if (dailyTasksTimer) {
    clearInterval(dailyTasksTimer);
    dailyTasksTimer = null;
  }
  if (marketTimer) {
    clearInterval(marketTimer);
    marketTimer = null;
  }
  isRunning = false;
  logger.info('Simulation engine stopped - Bank operations halted');
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
