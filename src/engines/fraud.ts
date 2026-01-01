/**
 * Fraud Engine
 * Detects suspicious patterns and triggers fraud alerts
 * Implements account freeze simulation and notifications
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '../core/logger.js';

const prisma = new PrismaClient();
const logger = createLogger('FraudEngine');

export type FraudAlertType =
  | 'geolocation_mismatch'
  | 'velocity'
  | 'midnight_large'
  | 'unusual_pattern'
  | 'duplicate_transaction'
  | 'new_device'
  | 'account_takeover'
  | 'card_testing'
  | 'suspicious_activity';

export type FraudSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FraudAlertStatus = 'open' | 'investigating' | 'confirmed' | 'dismissed';

interface FraudCheckResult {
  isFraudulent: boolean;
  alerts: Array<{
    type: FraudAlertType;
    severity: FraudSeverity;
    reason: string;
  }>;
  score: number; // 0-100, higher = more likely fraud
  shouldBlock: boolean;
  shouldFreeze: boolean;
}

interface TransactionContext {
  accountId: string;
  amount: number;
  type: string;
  category?: string;
  merchant?: string;
  location?: string;
  timestamp?: Date;
}

/**
 * Analyze a transaction for potential fraud
 */
export async function analyzeTransaction(
  context: TransactionContext
): Promise<FraudCheckResult> {
  const account = await prisma.account.findUnique({
    where: { id: context.accountId },
    include: {
      user: true,
      transactions: {
        where: {
          status: 'posted',
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!account) {
    return { isFraudulent: false, alerts: [], score: 0, shouldBlock: false, shouldFreeze: false };
  }

  const alerts: FraudCheckResult['alerts'] = [];
  let score = 0;

  const timestamp = context.timestamp || new Date();
  const hour = timestamp.getHours();

  // 1. Midnight Large Transaction Check
  if (hour >= 0 && hour < 5 && context.amount > 50000 && context.type === 'debit') {
    alerts.push({
      type: 'midnight_large',
      severity: 'high',
      reason: `Large transaction ($${(context.amount / 100).toFixed(2)}) during unusual hours (${hour}:00)`,
    });
    score += 35;
  }

  // 2. Velocity Check (rapid multiple transactions)
  const recentTransactions = account.transactions.filter(
    t => t.createdAt > new Date(Date.now() - 60 * 60 * 1000) // Last hour
  );
  if (recentTransactions.length >= 5) {
    alerts.push({
      type: 'velocity',
      severity: 'high',
      reason: `High velocity: ${recentTransactions.length} transactions in the last hour`,
    });
    score += 30;
  }

  // 3. Geolocation Mismatch
  if (context.location) {
    const previousLocations = account.transactions
      .slice(0, 20)
      .map(t => t.location)
      .filter(Boolean);
    
    const uniqueLocations = [...new Set(previousLocations)];
    
    if (uniqueLocations.length > 0 && !uniqueLocations.includes(context.location)) {
      // Check if there was a recent transaction in a different location
      const lastTransaction = account.transactions[0];
      if (lastTransaction && lastTransaction.location && lastTransaction.location !== context.location) {
        const timeSinceLastMs = timestamp.getTime() - lastTransaction.createdAt.getTime();
        const hoursSinceLast = timeSinceLastMs / (1000 * 60 * 60);
        
        // Impossible travel: different cities within a few hours
        if (hoursSinceLast < 2) {
          alerts.push({
            type: 'geolocation_mismatch',
            severity: 'critical',
            reason: `Impossible travel: ${lastTransaction.location} → ${context.location} in ${hoursSinceLast.toFixed(1)} hours`,
          });
          score += 50;
        } else if (hoursSinceLast < 8) {
          alerts.push({
            type: 'geolocation_mismatch',
            severity: 'medium',
            reason: `Unusual location change: ${lastTransaction.location} → ${context.location}`,
          });
          score += 20;
        }
      }
    }
  }

  // 4. Unusual Pattern (spending pattern mismatch)
  const avgDebit = account.transactions
    .filter(t => t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0) / Math.max(1, account.transactions.filter(t => t.type === 'debit').length);
  
  if (context.type === 'debit' && context.amount > avgDebit * 5 && avgDebit > 0) {
    alerts.push({
      type: 'unusual_pattern',
      severity: 'medium',
      reason: `Transaction amount ($${(context.amount / 100).toFixed(2)}) is ${(context.amount / avgDebit).toFixed(1)}x higher than average`,
    });
    score += 20;
  }

  // 5. Duplicate Transaction Check
  const duplicates = account.transactions.filter(t =>
    t.amount === context.amount &&
    t.merchant === context.merchant &&
    t.createdAt > new Date(Date.now() - 5 * 60 * 1000) // Within 5 minutes
  );
  if (duplicates.length > 0) {
    alerts.push({
      type: 'duplicate_transaction',
      severity: 'medium',
      reason: `Possible duplicate: Same amount ($${(context.amount / 100).toFixed(2)}) and merchant within 5 minutes`,
    });
    score += 25;
  }

  // 6. Card Testing Pattern (multiple small transactions)
  const smallTransactions = recentTransactions.filter(t => t.amount < 500); // Under $5
  if (smallTransactions.length >= 3) {
    alerts.push({
      type: 'card_testing',
      severity: 'high',
      reason: `Possible card testing: ${smallTransactions.length} small transactions in the last hour`,
    });
    score += 40;
  }

  const isFraudulent = score >= 50;
  const shouldBlock = score >= 70;
  const shouldFreeze = score >= 90;

  // Log alerts if any
  if (alerts.length > 0) {
    for (const alert of alerts) {
      await createFraudAlert(
        account.userId,
        alert.type,
        alert.severity,
        alert.reason,
        { accountId: context.accountId, amount: context.amount }
      );
    }
  }

  return {
    isFraudulent,
    alerts,
    score: Math.min(100, score),
    shouldBlock,
    shouldFreeze,
  };
}

/**
 * Create a fraud alert
 */
export async function createFraudAlert(
  userId: string,
  type: FraudAlertType,
  severity: FraudSeverity,
  description: string,
  metadata?: Record<string, any>,
  transactionId?: string
): Promise<any> {
  const alert = await prisma.fraudAlert.create({
    data: {
      userId,
      transactionId: transactionId ?? null,
      type,
      severity,
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });

  logger.warn(`Fraud alert created: ${type} (${severity})`, { userId, alertId: alert.id });

  // Auto-freeze for critical severity
  if (severity === 'critical') {
    const accounts = await prisma.account.findMany({ where: { userId } });
    for (const account of accounts) {
      await freezeAccount(account.id, 'Automatic freeze due to critical fraud alert', alert.id);
    }
  }

  return alert;
}

/**
 * Freeze an account due to fraud
 */
export async function freezeAccount(
  accountId: string,
  reason: string,
  alertId?: string
): Promise<void> {
  await prisma.account.update({
    where: { id: accountId },
    data: {
      frozen: true,
      frozenReason: reason,
      frozenAt: new Date(),
    },
  });

  if (alertId) {
    await prisma.fraudAlert.update({
      where: { id: alertId },
      data: { actionTaken: 'account_frozen' },
    });
  }

  logger.warn(`Account frozen: ${accountId}`, { reason, alertId });
}

/**
 * Unfreeze an account
 */
export async function unfreezeAccount(
  accountId: string,
  resolvedBy?: string
): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { user: true },
  });

  if (!account) throw new Error('Account not found');

  await prisma.account.update({
    where: { id: accountId },
    data: {
      frozen: false,
      frozenReason: null,
      frozenAt: null,
    },
  });

  // Resolve related fraud alerts
  await prisma.fraudAlert.updateMany({
    where: {
      userId: account.userId,
      status: 'open',
    },
    data: {
      status: 'dismissed',
      resolvedAt: new Date(),
      resolvedBy: resolvedBy ?? null,
    },
  });

  logger.info(`Account unfrozen: ${accountId}`, { resolvedBy });
}

/**
 * Get fraud alerts for a user
 */
export async function getUserFraudAlerts(
  userId: string,
  options?: { limit?: number; status?: FraudAlertStatus; severity?: FraudSeverity }
): Promise<any[]> {
  const where: any = { userId };
  if (options?.status) where.status = options.status;
  if (options?.severity) where.severity = options.severity;

  return prisma.fraudAlert.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 50,
  });
}

/**
 * Update fraud alert status
 */
export async function updateFraudAlertStatus(
  alertId: string,
  status: FraudAlertStatus,
  resolvedBy?: string,
  _notes?: string
): Promise<any> {
  const updateData: any = { status };
  
  if (status === 'confirmed' || status === 'dismissed') {
    updateData.resolvedAt = new Date();
    updateData.resolvedBy = resolvedBy ?? null;
  }

  return prisma.fraudAlert.update({
    where: { id: alertId },
    data: updateData,
  });
}

/**
 * Trigger a simulated fraud event for testing
 */
export async function triggerFraudEvent(
  userId?: string
): Promise<{ affected: number; alerts: any[] }> {
  logger.section('Triggering Fraud Event Simulation');
  
  // Get target users
  const users = userId
    ? [await prisma.user.findUnique({ where: { id: userId }, include: { accounts: true } })]
    : await prisma.user.findMany({
        take: 3,
        include: { accounts: true },
        where: { persona: { in: ['riskLover', 'entrepreneur', 'spender'] } },
      });

  const alerts: any[] = [];
  let affected = 0;

  for (const user of users.filter(Boolean)) {
    if (!user || user.accounts.length === 0) continue;

    // Create a suspicious transaction pattern
    const account = user.accounts[0];
    if (!account) continue;
    
    // Simulate multiple small transactions (card testing)
    for (let i = 0; i < 5; i++) {
      await prisma.transaction.create({
        data: {
          accountId: account.id,
          type: 'debit',
          amount: 100 + Math.floor(Math.random() * 400), // $1-$5
          category: 'purchase',
          merchant: 'Unknown Merchant',
          location: 'Unknown',
          status: 'posted',
          fraudFlag: true,
          description: 'Simulated suspicious transaction',
        },
      });
    }

    // Create fraud alerts
    const alert = await createFraudAlert(
      user.id,
      'card_testing',
      'critical',
      'Multiple small transactions detected - possible card testing',
      { accountId: account.id, simulatedEvent: true }
    );

    alerts.push(alert);
    affected++;
  }

  // Update simulation state
  await prisma.simulationState.update({
    where: { id: 'singleton' },
    data: { fraudEventActive: true },
  });

  logger.info(`Fraud event triggered: ${affected} users affected`);
  
  return { affected, alerts };
}

/**
 * Get fraud summary statistics
 */
export async function getFraudSummary(): Promise<{
  totalAlerts: number;
  openAlerts: number;
  byType: Record<FraudAlertType, number>;
  bySeverity: Record<FraudSeverity, number>;
  frozenAccounts: number;
  recentAlerts: any[];
}> {
  const [totalAlerts, openAlerts, alerts, frozenAccounts, recentAlerts] = await Promise.all([
    prisma.fraudAlert.count(),
    prisma.fraudAlert.count({ where: { status: 'open' } }),
    prisma.fraudAlert.findMany({ select: { type: true, severity: true } }),
    prisma.account.count({ where: { frozen: true } }),
    prisma.fraudAlert.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  alerts.forEach(alert => {
    byType[alert.type] = (byType[alert.type] || 0) + 1;
    bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
  });

  return {
    totalAlerts,
    openAlerts,
    byType: byType as Record<FraudAlertType, number>,
    bySeverity: bySeverity as Record<FraudSeverity, number>,
    frozenAccounts,
    recentAlerts,
  };
}
