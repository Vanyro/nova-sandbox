/**
 * Risk Engine
 * Calculates dynamic risk scores based on user behavior
 * Logs risk events with levels (Low, Medium, High, Critical)
 */

import { PrismaClient } from "@prisma/client";
import { createLogger } from "../core/logger.js";

const prisma = new PrismaClient();
const logger = createLogger("RiskEngine");

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type RiskEventType =
  | "spending_spike"
  | "overdraft"
  | "payment_missed"
  | "unusual_location"
  | "rapid_transactions"
  | "large_withdrawal"
  | "income_drop"
  | "credit_utilization"
  | "account_dormant"
  | "suspicious_pattern"
  | "fraud_alert"
  | "suspicious_login";

interface RiskFactors {
  spendingStability: number; // 0-100, lower is riskier
  incomeVolatility: number; // 0-100, higher is riskier
  overdraftFrequency: number; // 0-100, higher is riskier
  repaymentDiscipline: number; // 0-100, lower is riskier
  unusualBehavior: number; // 0-100, higher is riskier
  accountAge: number; // 0-100, lower is riskier (newer accounts)
  transactionDiversity: number; // 0-100, lower might be suspicious
}

interface RiskAssessment {
  userId: string;
  overallScore: number; // 0-100, higher is riskier
  level: RiskLevel;
  factors: RiskFactors;
  recommendations: string[];
}

/**
 * Calculate risk score for a user based on their financial behavior
 */
export async function calculateUserRiskScore(
  userId: string,
): Promise<RiskAssessment> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accounts: {
        include: {
          transactions: {
            where: {
              createdAt: {
                gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
              },
              status: "posted",
            },
          },
          loans: true,
        },
      },
      loans: true,
    },
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  // Calculate individual risk factors
  const factors = await calculateRiskFactors(user);

  // Calculate weighted overall score
  const weights = {
    spendingStability: 0.2,
    incomeVolatility: 0.15,
    overdraftFrequency: 0.2,
    repaymentDiscipline: 0.2,
    unusualBehavior: 0.15,
    accountAge: 0.05,
    transactionDiversity: 0.05,
  };

  // Invert factors where higher is better (stability, discipline, age, diversity)
  const overallScore = Math.round(
    (100 - factors.spendingStability) * weights.spendingStability +
      factors.incomeVolatility * weights.incomeVolatility +
      factors.overdraftFrequency * weights.overdraftFrequency +
      (100 - factors.repaymentDiscipline) * weights.repaymentDiscipline +
      factors.unusualBehavior * weights.unusualBehavior +
      (100 - factors.accountAge) * weights.accountAge +
      (100 - factors.transactionDiversity) * weights.transactionDiversity,
  );

  const level = getRiskLevel(overallScore);
  const recommendations = generateRecommendations(factors, level);

  // Update user's risk score
  await prisma.user.update({
    where: { id: userId },
    data: { riskScore: overallScore },
  });

  return {
    userId,
    overallScore,
    level,
    factors,
    recommendations,
  };
}

/**
 * Calculate individual risk factors
 */
async function calculateRiskFactors(user: any): Promise<RiskFactors> {
  const allTransactions = user.accounts.flatMap((a: any) => a.transactions);
  const allLoans = user.loans || [];

  // Spending Stability (variance in daily spending)
  const dailySpending = calculateDailySpending(allTransactions);
  const spendingStability = calculateStabilityScore(dailySpending);

  // Income Volatility (variance in income)
  const monthlyIncome = calculateMonthlyIncome(allTransactions);
  const incomeVolatility = calculateVolatilityScore(monthlyIncome);

  // Overdraft Frequency
  const overdraftCount = user.accounts.reduce(
    (sum: number, a: any) =>
      sum +
      (a.overdraftUsed > 0 ? 1 : 0) +
      countNegativeBalanceDays(a.transactions),
    0,
  );
  const overdraftFrequency = Math.min(100, overdraftCount * 10);

  // Repayment Discipline
  const paymentsMade = allLoans.reduce(
    (sum: number, l: any) => sum + l.paymentsMade,
    0,
  );
  const paymentsMissed = allLoans.reduce(
    (sum: number, l: any) => sum + l.paymentsMissed,
    0,
  );
  const totalPayments = paymentsMade + paymentsMissed;
  const repaymentDiscipline =
    totalPayments > 0 ? Math.round((paymentsMade / totalPayments) * 100) : 80; // Default for users with no loan history

  // Unusual Behavior (large transactions at odd hours, location mismatches)
  const unusualCount = countUnusualTransactions(allTransactions);
  const unusualBehavior = Math.min(100, unusualCount * 15);

  // Account Age (newer accounts are riskier)
  const oldestAccount = user.accounts.reduce(
    (oldest: Date, a: any) => (a.createdAt < oldest ? a.createdAt : oldest),
    new Date(),
  );
  const accountAgeDays = Math.floor(
    (Date.now() - oldestAccount.getTime()) / (24 * 60 * 60 * 1000),
  );
  const accountAge = Math.min(100, accountAgeDays / 3.65); // 365 days = 100

  // Transaction Diversity (variety in categories)
  const categories = new Set(
    allTransactions.map((t: any) => t.category).filter(Boolean),
  );
  const transactionDiversity = Math.min(100, categories.size * 10);

  return {
    spendingStability,
    incomeVolatility,
    overdraftFrequency,
    repaymentDiscipline,
    unusualBehavior,
    accountAge,
    transactionDiversity,
  };
}

/**
 * Get risk level from score
 */
function getRiskLevel(score: number): RiskLevel {
  if (score < 25) return "low";
  if (score < 50) return "medium";
  if (score < 75) return "high";
  return "critical";
}

/**
 * Generate recommendations based on risk factors
 */
function generateRecommendations(
  factors: RiskFactors,
  level: RiskLevel,
): string[] {
  const recommendations: string[] = [];

  if (factors.spendingStability < 40) {
    recommendations.push(
      "Consider setting up a budget to stabilize spending patterns",
    );
  }
  if (factors.incomeVolatility > 60) {
    recommendations.push(
      "Build an emergency fund to handle income fluctuations",
    );
  }
  if (factors.overdraftFrequency > 50) {
    recommendations.push("Review recurring expenses to avoid overdraft fees");
  }
  if (factors.repaymentDiscipline < 70) {
    recommendations.push(
      "Set up automatic loan payments to improve repayment history",
    );
  }
  if (factors.unusualBehavior > 40) {
    recommendations.push(
      "Review recent transactions for unauthorized activity",
    );
  }
  if (factors.accountAge < 30) {
    recommendations.push(
      "Build account history by maintaining consistent activity",
    );
  }

  if (level === "critical") {
    recommendations.unshift(
      "⚠️ Immediate attention required: High risk profile detected",
    );
  }

  return recommendations;
}

/**
 * Log a risk event
 */
export async function logRiskEvent(
  userId: string,
  type: RiskEventType,
  level: RiskLevel,
  description: string,
  metadata?: Record<string, any>,
): Promise<void> {
  await prisma.riskEvent.create({
    data: {
      userId,
      type,
      level,
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });

  logger.warn(`Risk event logged: ${type} (${level})`, { userId, description });

  // Update user risk score if critical
  if (level === "critical" || level === "high") {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      const riskIncrease = level === "critical" ? 15 : 10;
      await prisma.user.update({
        where: { id: userId },
        data: { riskScore: Math.min(100, user.riskScore + riskIncrease) },
      });
    }
  }
}

/**
 * Analyze transactions for risk patterns
 */
export async function analyzeTransactionRisk(
  accountId: string,
  amount: number,
  type: string,
  category?: string,
  location?: string,
): Promise<{ riskFlag: string | null; events: RiskEventType[] }> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      user: true,
      transactions: {
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!account) return { riskFlag: null, events: [] };

  const events: RiskEventType[] = [];
  let riskFlag: string | null = null;

  // Check for spending spike
  const avgSpending =
    account.transactions
      .filter((t) => t.type === "debit")
      .reduce((sum, t) => sum + t.amount, 0) /
    Math.max(1, account.transactions.length);

  if (type === "debit" && amount > avgSpending * 3 && amount > 50000) {
    // $500+
    events.push("spending_spike");
    riskFlag = "suspicious";
    await logRiskEvent(
      account.userId,
      "spending_spike",
      "medium",
      `Large transaction of $${(amount / 100).toFixed(2)} detected (${(amount / avgSpending).toFixed(1)}x average)`,
      { accountId, amount, avgSpending },
    );
  }

  // Check for rapid transactions
  const recentTransactions = account.transactions.filter(
    (t) => t.createdAt > new Date(Date.now() - 60 * 60 * 1000), // Last hour
  );
  if (recentTransactions.length >= 5) {
    events.push("rapid_transactions");
    riskFlag = "flagged";
    await logRiskEvent(
      account.userId,
      "rapid_transactions",
      "high",
      `${recentTransactions.length} transactions in the last hour`,
      { accountId, transactionCount: recentTransactions.length },
    );
  }

  // Check for unusual location
  const commonLocations = account.transactions
    .map((t) => t.location)
    .filter(Boolean);
  if (
    location &&
    commonLocations.length > 5 &&
    !commonLocations.includes(location)
  ) {
    events.push("unusual_location");
    riskFlag = riskFlag || "suspicious";
    await logRiskEvent(
      account.userId,
      "unusual_location",
      "medium",
      `Transaction from unusual location: ${location}`,
      { accountId, location, commonLocations: [...new Set(commonLocations)] },
    );
  }

  // Check for large withdrawal
  if (type === "debit" && category === "withdrawal" && amount > 100000) {
    // $1000+
    events.push("large_withdrawal");
    riskFlag = riskFlag || "suspicious";
    await logRiskEvent(
      account.userId,
      "large_withdrawal",
      "medium",
      `Large cash withdrawal of $${(amount / 100).toFixed(2)}`,
      { accountId, amount },
    );
  }

  return { riskFlag, events };
}

/**
 * Get risk events for a user
 */
export async function getUserRiskEvents(
  userId: string,
  options?: { limit?: number; level?: RiskLevel; resolved?: boolean },
): Promise<any[]> {
  const where: any = { userId };
  if (options?.level) where.level = options.level;
  if (options?.resolved !== undefined) where.resolved = options.resolved;

  return prisma.riskEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit || 50,
  });
}

/**
 * Get risk summary for all users
 */
export async function getRiskSummary(): Promise<{
  totalUsers: number;
  byLevel: Record<RiskLevel, number>;
  recentEvents: any[];
  averageScore: number;
}> {
  const users = await prisma.user.findMany({
    select: { riskScore: true },
  });

  const byLevel: Record<RiskLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  users.forEach((u) => {
    byLevel[getRiskLevel(u.riskScore)]++;
  });

  const recentEvents = await prisma.riskEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: { select: { name: true, email: true } } },
  });

  const averageScore =
    users.length > 0
      ? Math.round(
          users.reduce((sum, u) => sum + u.riskScore, 0) / users.length,
        )
      : 0;

  return {
    totalUsers: users.length,
    byLevel,
    recentEvents,
    averageScore,
  };
}

// ==================== HELPER FUNCTIONS ====================

function calculateDailySpending(transactions: any[]): number[] {
  const dailyMap = new Map<string, number>();
  transactions
    .filter((t) => t.type === "debit")
    .forEach((t) => {
      const day = t.createdAt.toISOString().split("T")[0];
      dailyMap.set(day, (dailyMap.get(day) || 0) + t.amount);
    });
  return Array.from(dailyMap.values());
}

function calculateMonthlyIncome(transactions: any[]): number[] {
  const monthlyMap = new Map<string, number>();
  transactions
    .filter((t) => t.type === "credit")
    .forEach((t) => {
      const month = t.createdAt.toISOString().slice(0, 7);
      monthlyMap.set(month, (monthlyMap.get(month) || 0) + t.amount);
    });
  return Array.from(monthlyMap.values());
}

function calculateStabilityScore(values: number[]): number {
  if (values.length < 2) return 80;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  const cv = Math.sqrt(variance) / (avg || 1); // Coefficient of variation
  return Math.max(0, Math.min(100, 100 - cv * 100));
}

function calculateVolatilityScore(values: number[]): number {
  if (values.length < 2) return 20;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
  const cv = Math.sqrt(variance) / (avg || 1);
  return Math.min(100, cv * 100);
}

function countNegativeBalanceDays(transactions: any[]): number {
  // Simplified: count transactions that would have caused negative balance
  return transactions.filter((t) => t.type === "debit" && t.amount > 100000)
    .length;
}

function countUnusualTransactions(transactions: any[]): number {
  return transactions.filter((t) => {
    const hour = t.createdAt.getHours();
    const isLateNight = hour >= 0 && hour < 5;
    const isLarge = t.amount > 50000; // $500+
    return isLateNight && isLarge;
  }).length;
}
