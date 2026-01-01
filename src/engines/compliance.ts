/**
 * Compliance Engine
 * Simulates KYC verification, AML monitoring, and sanction screening
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '../core/logger.js';
import { SeededRandom } from '../core/random.js';

const prisma = new PrismaClient();
const logger = createLogger('ComplianceEngine');

export type KYCStatus = 'pending' | 'verified' | 'rejected' | 'expired';
export type AMLStatus = 'clear' | 'flagged' | 'blocked';
export type SanctionStatus = 'clear' | 'match' | 'blocked';
export type ComplianceEventType = 'kyc_check' | 'aml_screening' | 'sanction_check' | 'sar_filed';
export type ComplianceEventStatus = 'passed' | 'failed' | 'pending' | 'flagged';

// Thresholds for AML monitoring
const AML_THRESHOLDS = {
  largeCashTransaction: 1000000, // $10,000
  dailyTransactionLimit: 2500000, // $25,000
  structuringThreshold: 950000, // $9,500 (just under reporting threshold)
  highFrequencyCount: 20, // transactions per day
};

/**
 * Process KYC verification for a user
 */
export async function processKYCVerification(
  userId: string,
  documentType: 'passport' | 'drivers_license' | 'national_id',
  seed?: number
): Promise<{
  success: boolean;
  status: KYCStatus;
  message: string;
  verificationId?: string;
}> {
  const rng = new SeededRandom(seed || Date.now());
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return { success: false, status: 'rejected', message: 'User not found' };
  }

  // Simulate verification process
  // 85% chance of approval, 10% pending manual review, 5% rejection
  const roll = rng.next();
  let status: KYCStatus;
  let message: string;
  let logStatus: ComplianceEventStatus;

  if (roll < 0.85) {
    status = 'verified';
    message = 'KYC verification successful';
    logStatus = 'passed';
  } else if (roll < 0.95) {
    status = 'pending';
    message = 'Documents submitted for manual review';
    logStatus = 'pending';
  } else {
    status = 'rejected';
    message = 'KYC verification failed - document quality insufficient';
    logStatus = 'failed';
  }

  // Update user
  await prisma.user.update({
    where: { id: userId },
    data: { 
      kycStatus: status,
      kycVerifiedAt: status === 'verified' ? new Date() : null,
    },
  });

  // Log compliance event
  const log = await prisma.complianceLog.create({
    data: {
      userId,
      type: 'kyc_check',
      status: logStatus,
      description: message,
      metadata: JSON.stringify({
        documentType,
        previousStatus: user.kycStatus,
        newStatus: status,
      }),
    },
  });

  logger.info(`KYC verification processed for user ${userId}`, {
    status,
    documentType,
    logId: log.id,
  });

  return {
    success: status === 'verified',
    status,
    message,
    verificationId: log.id,
  };
}

/**
 * Analyze transaction for AML compliance
 */
export async function analyzeTransactionAML(
  userId: string,
  amount: number,
): Promise<{
  flagged: boolean;
  flags: string[];
  requiresReview: boolean;
}> {
  const flags: string[] = [];

  // Check for large cash transaction
  if (amount >= AML_THRESHOLDS.largeCashTransaction) {
    flags.push('large_cash_transaction');
    
    await prisma.complianceLog.create({
      data: {
        userId,
        type: 'aml_screening',
        status: 'flagged',
        description: `Large transaction detected: $${(amount / 100).toFixed(2)}`,
        metadata: JSON.stringify({ amount, threshold: AML_THRESHOLDS.largeCashTransaction }),
      },
    });
  }

  // Check for structuring (transactions just under reporting threshold)
  if (amount >= AML_THRESHOLDS.structuringThreshold && amount < AML_THRESHOLDS.largeCashTransaction) {
    // Check for pattern of similar transactions
    const recentSimilar = await prisma.transaction.count({
      where: {
        account: { userId },
        amount: {
          gte: AML_THRESHOLDS.structuringThreshold,
          lt: AML_THRESHOLDS.largeCashTransaction,
        },
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      },
    });

    if (recentSimilar >= 3) {
      flags.push('structuring_detected');

      await prisma.complianceLog.create({
        data: {
          userId,
          type: 'aml_screening',
          status: 'flagged',
          description: `Potential structuring detected: ${recentSimilar} transactions just under reporting threshold`,
          metadata: JSON.stringify({ recentCount: recentSimilar, amount }),
        },
      });
    }
  }

  // Check daily transaction volume
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const dailyStats = await prisma.transaction.aggregate({
    where: {
      account: { userId },
      createdAt: { gte: todayStart },
    },
    _sum: { amount: true },
    _count: true,
  });

  if ((dailyStats._sum.amount || 0) > AML_THRESHOLDS.dailyTransactionLimit) {
    flags.push('daily_limit_exceeded');
  }

  if ((dailyStats._count || 0) > AML_THRESHOLDS.highFrequencyCount) {
    flags.push('high_frequency_trading');
  }

  // Update user AML status if flagged
  if (flags.length > 0) {
    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    
    if (currentUser?.amlStatus === 'clear') {
      await prisma.user.update({
        where: { id: userId },
        data: { amlStatus: 'flagged' },
      });

      await prisma.complianceLog.create({
        data: {
          userId,
          type: 'aml_screening',
          status: 'flagged',
          description: `AML review initiated due to: ${flags.join(', ')}`,
          metadata: JSON.stringify({ flags }),
        },
      });
    }

    logger.warn(`AML flags raised for user ${userId}`, { flags });
  }

  return {
    flagged: flags.length > 0,
    flags,
    requiresReview: flags.length > 0,
  };
}

/**
 * Perform sanction screening on a user
 */
export async function performSanctionScreening(
  userId: string,
  name?: string,
  _country?: string
): Promise<{
  clear: boolean;
  status: SanctionStatus;
  matches: Array<{ type: string; confidence: number }>;
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { clear: false, status: 'match', matches: [] };
  }

  const checkName = name || user.name;
  const matches: Array<{ type: string; confidence: number }> = [];

  // Check for sanctioned patterns in name (simulation)
  const sanctionedPatterns = ['sanctioned', 'blocked', 'restricted', 'embargo'];
  const lowerName = checkName.toLowerCase();
  for (const pattern of sanctionedPatterns) {
    if (lowerName.includes(pattern)) {
      matches.push({ type: 'name_match', confidence: 0.95 });
    }
  }

  // Simulate false positive chance
  if (Math.random() < 0.02) {
    matches.push({ type: 'fuzzy_name_match', confidence: 0.45 });
  }

  let status: SanctionStatus = 'clear';
  if (matches.some(m => m.confidence >= 0.9)) {
    status = 'blocked';
  } else if (matches.length > 0) {
    status = 'match';
  }

  // Update user
  await prisma.user.update({
    where: { id: userId },
    data: { sanctionStatus: status },
  });

  // Log screening
  await prisma.complianceLog.create({
    data: {
      userId,
      type: 'sanction_check',
      status: status === 'clear' ? 'passed' : 'flagged',
      description: `Sanction screening completed: ${status}`,
      metadata: JSON.stringify({ matches, screenedName: checkName }),
    },
  });

  logger.info(`Sanction screening for user ${userId}`, { status, matchCount: matches.length });

  return { clear: status === 'clear', status, matches };
}

/**
 * Clear AML flag for a user (after review)
 */
export async function clearAMLFlag(
  userId: string,
  reviewerNote: string
): Promise<{ success: boolean; newStatus: AMLStatus }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  
  if (!user) {
    return { success: false, newStatus: 'clear' };
  }

  if (user.amlStatus === 'clear') {
    return { success: true, newStatus: 'clear' };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { amlStatus: 'clear' },
  });

  await prisma.complianceLog.create({
    data: {
      userId,
      type: 'aml_screening',
      status: 'passed',
      description: 'AML flag cleared after review',
      metadata: JSON.stringify({ 
        previousStatus: user.amlStatus, 
        reviewerNote,
        clearedAt: new Date().toISOString(),
      }),
    },
  });

  logger.info(`AML flag cleared for user ${userId}`);

  return { success: true, newStatus: 'clear' };
}

/**
 * Block user due to AML concerns
 */
export async function blockUserAML(
  userId: string,
  reason: string
): Promise<{ success: boolean }> {
  await prisma.user.update({
    where: { id: userId },
    data: { amlStatus: 'blocked' },
  });

  // Freeze all accounts
  await prisma.account.updateMany({
    where: { userId },
    data: {
      frozen: true,
      frozenReason: `AML Block: ${reason}`,
      frozenAt: new Date(),
    },
  });

  await prisma.complianceLog.create({
    data: {
      userId,
      type: 'aml_screening',
      status: 'failed',
      description: `User blocked due to AML concerns: ${reason}`,
      metadata: JSON.stringify({ reason }),
    },
  });

  logger.warn(`User ${userId} blocked due to AML concerns`, { reason });

  return { success: true };
}

/**
 * Get compliance logs for a user
 */
export async function getUserComplianceLogs(
  userId: string,
  options: {
    limit?: number;
    types?: ComplianceEventType[];
  } = {}
): Promise<any[]> {
  const where: any = { userId };
  
  if (options.types?.length) {
    where.type = { in: options.types };
  }

  return prisma.complianceLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options.limit || 50,
  });
}

/**
 * Get compliance summary statistics
 */
export async function getComplianceSummary(): Promise<{
  kycStats: {
    verified: number;
    pending: number;
    rejected: number;
  };
  amlStats: {
    clear: number;
    flagged: number;
    blocked: number;
  };
  sanctionStats: {
    clear: number;
    match: number;
    blocked: number;
  };
  recentEvents: {
    total: number;
    flagged: number;
  };
}> {
  const users = await prisma.user.findMany({
    select: {
      kycStatus: true,
      amlStatus: true,
      sanctionStatus: true,
    },
  });

  const kycStats = {
    verified: users.filter(u => u.kycStatus === 'verified').length,
    pending: users.filter(u => u.kycStatus === 'pending').length,
    rejected: users.filter(u => u.kycStatus === 'rejected').length,
  };

  const amlStats = {
    clear: users.filter(u => u.amlStatus === 'clear').length,
    flagged: users.filter(u => u.amlStatus === 'flagged').length,
    blocked: users.filter(u => u.amlStatus === 'blocked').length,
  };

  const sanctionStats = {
    clear: users.filter(u => u.sanctionStatus === 'clear').length,
    match: users.filter(u => u.sanctionStatus === 'match').length,
    blocked: users.filter(u => u.sanctionStatus === 'blocked').length,
  };

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentLogs = await prisma.complianceLog.findMany({
    where: { createdAt: { gte: last24h } },
    select: { status: true },
  });

  const recentEvents = {
    total: recentLogs.length,
    flagged: recentLogs.filter(l => l.status === 'flagged' || l.status === 'failed').length,
  };

  return { kycStats, amlStats, sanctionStats, recentEvents };
}

/**
 * Run scheduled compliance checks
 */
export async function runScheduledComplianceChecks(): Promise<{
  kycExpired: number;
  sanctionRescreen: number;
  amlReviewed: number;
}> {
  logger.section('Running Scheduled Compliance Checks');

  // Expire KYC for users verified > 30 days ago (simulation)
  const kycExpiryDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const kycExpiredResult = await prisma.user.updateMany({
    where: {
      kycStatus: 'verified',
      kycVerifiedAt: { lt: kycExpiryDate },
    },
    data: { kycStatus: 'expired' },
  });

  // Re-screen users with sanction matches
  const potentialMatches = await prisma.user.findMany({
    where: { sanctionStatus: 'match' },
    take: 10,
  });

  let sanctionRescreen = 0;
  for (const user of potentialMatches) {
    await performSanctionScreening(user.id);
    sanctionRescreen++;
  }

  // Count flagged AML users
  const amlReviewed = await prisma.user.count({
    where: { amlStatus: 'flagged' },
  });

  logger.info('Scheduled compliance checks complete', {
    kycExpired: kycExpiredResult.count,
    sanctionRescreen,
    amlReviewed,
  });

  return {
    kycExpired: kycExpiredResult.count,
    sanctionRescreen,
    amlReviewed,
  };
}
