/**
 * Loans Engine
 * Handles loan eligibility, approval, repayment, interest, and defaults
 * Supports student loans, consumer loans, business loans, and emergency loans
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '../core/logger.js';
import { logRiskEvent } from './risk.js';

const prisma = new PrismaClient();
const logger = createLogger('LoansEngine');

export type LoanType = 'student' | 'consumer' | 'business' | 'emergency';
export type LoanStatus = 'pending' | 'approved' | 'active' | 'paid' | 'defaulted' | 'rejected';

interface LoanConfig {
  minAmount: number;      // Minimum loan amount in cents
  maxAmount: number;      // Maximum loan amount in cents
  minTermMonths: number;
  maxTermMonths: number;
  baseInterestRate: number; // Annual rate
  minCreditScore: number;   // Minimum risk score (inverted: lower is better)
}

const LOAN_CONFIGS: Record<LoanType, LoanConfig> = {
  student: {
    minAmount: 100000,      // $1,000
    maxAmount: 5000000,     // $50,000
    minTermMonths: 12,
    maxTermMonths: 120,
    baseInterestRate: 0.045, // 4.5%
    minCreditScore: 70,     // Max risk score allowed
  },
  consumer: {
    minAmount: 50000,       // $500
    maxAmount: 2500000,     // $25,000
    minTermMonths: 6,
    maxTermMonths: 60,
    baseInterestRate: 0.085, // 8.5%
    minCreditScore: 60,
  },
  business: {
    minAmount: 500000,      // $5,000
    maxAmount: 25000000,    // $250,000
    minTermMonths: 12,
    maxTermMonths: 84,
    baseInterestRate: 0.065, // 6.5%
    minCreditScore: 50,
  },
  emergency: {
    minAmount: 10000,       // $100
    maxAmount: 200000,      // $2,000
    minTermMonths: 1,
    maxTermMonths: 12,
    baseInterestRate: 0.18,  // 18% (high for emergency)
    minCreditScore: 80,     // More lenient
  },
};

interface EligibilityResult {
  eligible: boolean;
  maxAmount: number;
  suggestedAmount: number;
  interestRate: number;
  suggestedTermMonths: number;
  monthlyPayment: number;
  reasons: string[];
  warnings: string[];
}

interface LoanApplicationResult {
  success: boolean;
  loan?: any;
  error?: string;
  eligibility?: EligibilityResult;
}

/**
 * Check loan eligibility for a user
 */
export async function checkLoanEligibility(
  userId: string,
  loanType: LoanType,
  requestedAmount?: number
): Promise<EligibilityResult> {
  const config = LOAN_CONFIGS[loanType];
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Get user with financial data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accounts: true,
      loans: {
        where: {
          status: { in: ['active', 'pending'] },
        },
      },
    },
  });

  if (!user) {
    return {
      eligible: false,
      maxAmount: 0,
      suggestedAmount: 0,
      interestRate: 0,
      suggestedTermMonths: 0,
      monthlyPayment: 0,
      reasons: ['User not found'],
      warnings: [],
    };
  }

  // Check risk score
  if (user.riskScore > config.minCreditScore) {
    reasons.push(`Risk score (${user.riskScore}) exceeds maximum allowed (${config.minCreditScore})`);
  }

  // Check KYC status
  if (user.kycStatus !== 'verified') {
    reasons.push(`KYC verification required (current status: ${user.kycStatus})`);
  }

  // Check AML status
  if (user.amlStatus !== 'clear') {
    reasons.push(`AML status is ${user.amlStatus}`);
  }

  // Check existing loan burden
  const existingLoanTotal = user.loans.reduce((sum, l) => sum + l.remainingAmount, 0);
  const totalBalance = user.accounts.reduce((sum, a) => sum + Math.max(0, a.balance), 0);
  
  if (existingLoanTotal > totalBalance * 3) {
    reasons.push('Existing loan burden is too high');
  }

  // Calculate maximum loan amount based on financial profile
  let maxAmount = config.maxAmount;
  
  // Reduce max based on risk score
  const riskMultiplier = Math.max(0.3, 1 - (user.riskScore / 100));
  maxAmount = Math.floor(maxAmount * riskMultiplier);
  
  // Reduce based on existing loans
  maxAmount = Math.max(config.minAmount, maxAmount - existingLoanTotal);
  
  // Cap at configured maximum
  maxAmount = Math.min(maxAmount, config.maxAmount);

  // Calculate interest rate (base + risk adjustment)
  const riskPremium = (user.riskScore / 100) * 0.05; // Up to 5% additional
  const interestRate = config.baseInterestRate + riskPremium;

  // Determine suggested term
  const suggestedTermMonths = Math.min(
    config.maxTermMonths,
    Math.max(config.minTermMonths, Math.ceil((requestedAmount || maxAmount) / 50000) * 12)
  );

  // Calculate suggested amount
  const suggestedAmount = requestedAmount 
    ? Math.min(requestedAmount, maxAmount)
    : Math.min(maxAmount, Math.floor(totalBalance * 0.5));

  // Calculate monthly payment
  const monthlyPayment = calculateMonthlyPayment(suggestedAmount, interestRate, suggestedTermMonths);

  // Add warnings
  if (user.riskScore > 40) {
    warnings.push('Higher interest rate due to elevated risk profile');
  }
  if (existingLoanTotal > 0) {
    warnings.push(`Existing loan balance of $${(existingLoanTotal / 100).toFixed(2)} will affect approval`);
  }
  if (user.persona === 'riskLover') {
    warnings.push('Your spending pattern suggests higher risk profile');
  }

  const eligible = reasons.length === 0 && maxAmount >= config.minAmount;

  return {
    eligible,
    maxAmount,
    suggestedAmount: eligible ? suggestedAmount : 0,
    interestRate,
    suggestedTermMonths,
    monthlyPayment: eligible ? monthlyPayment : 0,
    reasons,
    warnings,
  };
}

/**
 * Apply for a loan
 */
export async function applyForLoan(
  userId: string,
  accountId: string,
  loanType: LoanType,
  amount: number,
  termMonths: number
): Promise<LoanApplicationResult> {
  const config = LOAN_CONFIGS[loanType];

  // Validate amount
  if (amount < config.minAmount || amount > config.maxAmount) {
    return {
      success: false,
      error: `Loan amount must be between $${(config.minAmount / 100).toFixed(2)} and $${(config.maxAmount / 100).toFixed(2)}`,
    };
  }

  // Validate term
  if (termMonths < config.minTermMonths || termMonths > config.maxTermMonths) {
    return {
      success: false,
      error: `Loan term must be between ${config.minTermMonths} and ${config.maxTermMonths} months`,
    };
  }

  // Check eligibility
  const eligibility = await checkLoanEligibility(userId, loanType, amount);
  if (!eligibility.eligible) {
    return {
      success: false,
      error: `Loan application denied: ${eligibility.reasons.join('; ')}`,
      eligibility,
    };
  }

  // Calculate monthly payment
  const monthlyPayment = calculateMonthlyPayment(amount, eligibility.interestRate, termMonths);

  // Create the loan
  const loan = await prisma.loan.create({
    data: {
      userId,
      accountId,
      type: loanType,
      status: 'pending',
      principalAmount: amount,
      remainingAmount: amount,
      interestRate: eligibility.interestRate,
      monthlyPayment,
      termMonths,
    },
  });

  logger.info(`Loan application submitted`, {
    loanId: loan.id,
    userId,
    type: loanType,
    amount: `$${(amount / 100).toFixed(2)}`,
  });

  // Auto-approve for low-risk users (simulation behavior)
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user && user.riskScore < 30) {
    return approveLoan(loan.id);
  }

  return { success: true, loan, eligibility };
}

/**
 * Approve a pending loan
 */
export async function approveLoan(loanId: string): Promise<LoanApplicationResult> {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { account: true },
  });

  if (!loan) {
    return { success: false, error: 'Loan not found' };
  }

  if (loan.status !== 'pending') {
    return { success: false, error: `Loan is already ${loan.status}` };
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + loan.termMonths);
  
  const nextPaymentDate = new Date();
  nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

  // Update loan status
  const updatedLoan = await prisma.loan.update({
    where: { id: loanId },
    data: {
      status: 'active',
      approvedAt: new Date(),
      startDate,
      endDate,
      nextPaymentDate,
    },
  });

  // Disburse funds to account
  await prisma.account.update({
    where: { id: loan.accountId },
    data: {
      balance: { increment: loan.principalAmount },
    },
  });

  // Create disbursement transaction
  await prisma.transaction.create({
    data: {
      accountId: loan.accountId,
      type: 'credit',
      amount: loan.principalAmount,
      category: 'loan_disbursement',
      description: `${loan.type} loan disbursement`,
      status: 'posted',
      postedAt: new Date(),
    },
  });

  logger.info(`Loan approved and disbursed`, {
    loanId,
    amount: `$${(loan.principalAmount / 100).toFixed(2)}`,
  });

  return { success: true, loan: updatedLoan };
}

/**
 * Reject a pending loan
 */
export async function rejectLoan(loanId: string, reason: string): Promise<LoanApplicationResult> {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });

  if (!loan) {
    return { success: false, error: 'Loan not found' };
  }

  if (loan.status !== 'pending') {
    return { success: false, error: `Loan is already ${loan.status}` };
  }

  const updatedLoan = await prisma.loan.update({
    where: { id: loanId },
    data: {
      status: 'rejected',
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  });

  logger.info(`Loan rejected`, { loanId, reason });

  return { success: true, loan: updatedLoan };
}

/**
 * Process a loan payment
 */
export async function processLoanPayment(
  loanId: string,
  paymentAmount?: number
): Promise<{ success: boolean; payment?: any; error?: string }> {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { account: true },
  });

  if (!loan) {
    return { success: false, error: 'Loan not found' };
  }

  if (loan.status !== 'active') {
    return { success: false, error: `Loan is ${loan.status}` };
  }

  const amount = paymentAmount || loan.monthlyPayment;

  // Check if account has sufficient funds
  if (loan.account.balance < amount) {
    // Log missed payment
    await prisma.loan.update({
      where: { id: loanId },
      data: { paymentsMissed: { increment: 1 } },
    });

    await logRiskEvent(
      loan.userId,
      'payment_missed',
      'high',
      `Missed loan payment of $${(amount / 100).toFixed(2)} due to insufficient funds`,
      { loanId, amount }
    );

    // Check for default (3+ missed payments)
    if (loan.paymentsMissed >= 2) {
      await defaultLoan(loanId);
    }

    return { success: false, error: 'Insufficient funds for loan payment' };
  }

  // Calculate interest and principal portions
  const monthlyInterest = Math.floor(loan.remainingAmount * (loan.interestRate / 12));
  const principalPayment = Math.max(0, amount - monthlyInterest);

  // Deduct from account
  await prisma.account.update({
    where: { id: loan.accountId },
    data: { balance: { decrement: amount } },
  });

  // Create payment record
  const payment = await prisma.loanPayment.create({
    data: {
      loanId,
      amount,
      principal: principalPayment,
      interest: monthlyInterest,
      status: 'completed',
    },
  });

  // Create transaction record
  await prisma.transaction.create({
    data: {
      accountId: loan.accountId,
      type: 'debit',
      amount,
      category: 'loan_payment',
      description: `${loan.type} loan payment`,
      status: 'posted',
      postedAt: new Date(),
    },
  });

  // Update loan
  const newRemainingAmount = Math.max(0, loan.remainingAmount - principalPayment);
  const nextPaymentDate = new Date();
  nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

  const loanStatus = newRemainingAmount <= 0 ? 'paid' : 'active';

  await prisma.loan.update({
    where: { id: loanId },
    data: {
      remainingAmount: newRemainingAmount,
      paymentsMade: { increment: 1 },
      lastPaymentDate: new Date(),
      lastPaymentAmount: amount,
      nextPaymentDate: loanStatus === 'active' ? nextPaymentDate : null,
      status: loanStatus,
    },
  });

  logger.info(`Loan payment processed`, {
    loanId,
    amount: `$${(amount / 100).toFixed(2)}`,
    remaining: `$${(newRemainingAmount / 100).toFixed(2)}`,
    status: loanStatus,
  });

  return { success: true, payment };
}

/**
 * Default a loan
 */
async function defaultLoan(loanId: string): Promise<void> {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } });
  if (!loan) return;

  await prisma.loan.update({
    where: { id: loanId },
    data: {
      status: 'defaulted',
      defaultedAt: new Date(),
    },
  });

  await logRiskEvent(
    loan.userId,
    'payment_missed',
    'critical',
    `Loan defaulted after ${loan.paymentsMissed + 1} missed payments`,
    { loanId, remainingAmount: loan.remainingAmount }
  );

  logger.warn(`Loan defaulted`, { loanId, userId: loan.userId });
}

/**
 * Process all due loan payments (called by simulation)
 */
export async function processDueLoanPayments(): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  const dueLoans = await prisma.loan.findMany({
    where: {
      status: 'active',
      nextPaymentDate: { lte: new Date() },
    },
  });

  let successful = 0;
  let failed = 0;

  for (const loan of dueLoans) {
    const result = await processLoanPayment(loan.id);
    if (result.success) {
      successful++;
    } else {
      failed++;
    }
  }

  logger.info(`Processed due loan payments`, { total: dueLoans.length, successful, failed });

  return { processed: dueLoans.length, successful, failed };
}

/**
 * Get user's loans
 */
export async function getUserLoans(
  userId: string,
  options?: { status?: LoanStatus; type?: LoanType }
): Promise<any[]> {
  const where: any = { userId };
  if (options?.status) where.status = options.status;
  if (options?.type) where.type = options.type;

  return prisma.loan.findMany({
    where,
    include: {
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get loan summary statistics
 */
export async function getLoanSummary(): Promise<{
  totalLoans: number;
  activeLoans: number;
  totalDisbursed: number;
  totalRemaining: number;
  defaultRate: number;
  byType: Record<LoanType, { count: number; totalAmount: number }>;
  byStatus: Record<LoanStatus, number>;
}> {
  const loans = await prisma.loan.findMany();

  const byType: Record<string, { count: number; totalAmount: number }> = {};
  const byStatus: Record<string, number> = {};
  let totalDisbursed = 0;
  let totalRemaining = 0;
  let defaultedCount = 0;

  loans.forEach(loan => {
    // By type
    if (!byType[loan.type]) {
      byType[loan.type] = { count: 0, totalAmount: 0 };
    }
    byType[loan.type]!.count++;
    byType[loan.type]!.totalAmount += loan.principalAmount;

    // By status
    byStatus[loan.status] = (byStatus[loan.status] || 0) + 1;

    // Totals
    if (loan.status !== 'pending' && loan.status !== 'rejected') {
      totalDisbursed += loan.principalAmount;
    }
    if (loan.status === 'active') {
      totalRemaining += loan.remainingAmount;
    }
    if (loan.status === 'defaulted') {
      defaultedCount++;
    }
  });

  const completedLoans = loans.filter(l => 
    ['paid', 'defaulted'].includes(l.status)
  ).length;
  const defaultRate = completedLoans > 0 ? defaultedCount / completedLoans : 0;

  return {
    totalLoans: loans.length,
    activeLoans: byStatus['active'] || 0,
    totalDisbursed,
    totalRemaining,
    defaultRate,
    byType: byType as Record<LoanType, { count: number; totalAmount: number }>,
    byStatus: byStatus as Record<LoanStatus, number>,
  };
}

/**
 * Process all loan payments due today (automatic daily task)
 */
export async function processLoanPayments(): Promise<{
  processed: number;
  successful: number;
  failed: number;
  totalCollected: number;
}> {
  const results = {
    processed: 0,
    successful: 0,
    failed: 0,
    totalCollected: 0,
  };
  
  // Get all active loans with payment due
  const activeLoans = await prisma.loan.findMany({
    where: { status: 'active' },
    include: { account: true },
  });
  
  const today = new Date();
  
  for (const loan of activeLoans) {
    // Check if payment is due (simplified: payments due on same day of month as loan start)
    const loanStartDay = loan.createdAt.getDate();
    if (today.getDate() !== loanStartDay) continue;
    
    results.processed++;
    
    // Try to make payment from linked account
    if (loan.account && loan.account.balance >= loan.monthlyPayment) {
      try {
        const paymentResult = await processLoanPayment(loan.id, loan.monthlyPayment);
        if (paymentResult.success) {
          results.successful++;
          results.totalCollected += loan.monthlyPayment;
        } else {
          results.failed++;
        }
      } catch (e) {
        results.failed++;
      }
    } else {
      // Insufficient funds - will be caught by default processing
      results.failed++;
    }
  }
  
  return results;
}

/**
 * Process loan defaults for overdue payments (automatic daily task)
 */
export async function processLoanDefaults(): Promise<{
  checked: number;
  defaulted: number;
  warningsSent: number;
}> {
  const results = {
    checked: 0,
    defaulted: 0,
    warningsSent: 0,
  };
  
  const activeLoans = await prisma.loan.findMany({
    where: { status: 'active' },
    include: { 
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      user: true,
    },
  });
  
  const now = new Date();
  
  for (const loan of activeLoans) {
    results.checked++;
    
    // Check last payment date
    const lastPayment = loan.payments[0];
    const daysSincePayment = lastPayment 
      ? Math.floor((now.getTime() - lastPayment.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : Math.floor((now.getTime() - loan.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    
    // Default after 90 days of no payment
    if (daysSincePayment >= 90) {
      await prisma.loan.update({
        where: { id: loan.id },
        data: { status: 'defaulted' },
      });
      results.defaulted++;
    }
    // Send warning after 30 days
    else if (daysSincePayment >= 30) {
      results.warningsSent++;
    }
  }
  
  return results;
}

/**
 * Calculate monthly payment using amortization formula
 */
function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  termMonths: number
): number {
  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) {
    return Math.ceil(principal / termMonths);
  }
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);
  return Math.ceil(payment);
}
