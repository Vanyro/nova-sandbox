/**
 * Transaction Lifecycle Manager
 * Handles the AUTHORIZED → PENDING → POSTED lifecycle
 */

import { PrismaClient } from "@prisma/client";
import { createLogger } from "../core/logger.js";
import { getSimulationConfig } from "../core/simulationConfig.js";
import { SeededRandom } from "../core/random.js";

const prisma = new PrismaClient();
const logger = createLogger("TransactionLifecycle");

export type TransactionStatus = "pending" | "posted" | "canceled";

export interface CreateTransactionOptions {
  accountId: string;
  type: "credit" | "debit";
  amount: number;
  category?: string;
  merchant?: string;
  location?: string;
  reference?: string;
  description?: string;
  skipValidation?: boolean; // For seeding/testing
}

export interface TransactionResult {
  success: boolean;
  transaction?: any;
  error?: string;
  code?: string;
}

/**
 * Validate account can perform transaction
 */
async function validateTransaction(
  account: any,
  type: string,
  amount: number,
): Promise<{ valid: boolean; error?: string; code?: string }> {
  // Check if account is frozen
  if (account.frozen) {
    return {
      valid: false,
      error: "Account is frozen and cannot process transactions",
      code: "ACCOUNT_FROZEN",
    };
  }

  // For debits, check balance and limits
  if (type === "debit") {
    // Check daily limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Reset daily spent if it's a new day
    if (!account.dailySpentDate || new Date(account.dailySpentDate) < today) {
      await prisma.account.update({
        where: { id: account.id },
        data: { dailySpent: 0, dailySpentDate: today },
      });
      account.dailySpent = 0;
    }

    // Check if transaction would exceed daily limit
    if (account.dailySpent + amount > account.dailyLimit) {
      return {
        valid: false,
        error: `Transaction would exceed daily spending limit of $${(account.dailyLimit / 100).toFixed(2)}`,
        code: "DAILY_LIMIT_EXCEEDED",
      };
    }

    // Check balance (with overdraft consideration)
    const config = getSimulationConfig();
    const effectiveBalance = account.overdraftEnabled
      ? account.balance + config.maxOverdraftAmount
      : account.balance;

    if (amount > effectiveBalance) {
      return {
        valid: false,
        error: account.overdraftEnabled
          ? `Insufficient funds (including overdraft limit of $${(config.maxOverdraftAmount / 100).toFixed(2)})`
          : "Insufficient funds",
        code: "INSUFFICIENT_FUNDS",
      };
    }
  }

  return { valid: true };
}

/**
 * Create a new transaction with proper lifecycle handling
 */
export async function createTransaction(
  options: CreateTransactionOptions,
): Promise<TransactionResult> {
  const config = getSimulationConfig();

  try {
    // Get account
    const account = await prisma.account.findUnique({
      where: { id: options.accountId },
    });

    if (!account) {
      return {
        success: false,
        error: "Account not found",
        code: "ACCOUNT_NOT_FOUND",
      };
    }

    // Validate transaction (unless skipped for seeding)
    if (!options.skipValidation) {
      const validation = await validateTransaction(
        account,
        options.type,
        options.amount,
      );
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error ?? "Validation failed",
          code: validation.code ?? "VALIDATION_ERROR",
        };
      }
    }

    // Calculate when transaction should be auto-posted
    const postAt = new Date(Date.now() + config.pendingDurationMs);

    // Create transaction in pending state
    const transaction = await prisma.transaction.create({
      data: {
        accountId: options.accountId,
        type: options.type,
        amount: options.amount,
        authorizedAmount: options.amount, // Store original amount
        category: options.category ?? null,
        merchant: options.merchant ?? null,
        location: options.location ?? null,
        reference: options.reference || generateReference(),
        description: options.description ?? null,
        status: "pending",
        postAt,
      },
    });

    // Update daily spent for debits
    if (options.type === "debit" && !options.skipValidation) {
      await prisma.account.update({
        where: { id: options.accountId },
        data: {
          dailySpent: { increment: options.amount },
          dailySpentDate: new Date(),
        },
      });
    }

    // Update balance immediately for pending transactions (holds)
    const balanceChange =
      options.type === "credit" ? options.amount : -options.amount;
    await prisma.account.update({
      where: { id: options.accountId },
      data: { balance: { increment: balanceChange } },
    });

    logger.info(`Created pending transaction ${transaction.id}`, {
      accountId: options.accountId,
      type: options.type,
      amount: options.amount,
      postAt: postAt.toISOString(),
    });

    return { success: true, transaction };
  } catch (error) {
    logger.error("Failed to create transaction", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      code: "TRANSACTION_ERROR",
    };
  }
}

/**
 * Post a pending transaction
 */
export async function postTransaction(
  transactionId: string,
  finalAmount?: number,
): Promise<TransactionResult> {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { account: true },
    });

    if (!transaction) {
      return {
        success: false,
        error: "Transaction not found",
        code: "TRANSACTION_NOT_FOUND",
      };
    }

    if (transaction.status !== "pending") {
      return {
        success: false,
        error: `Transaction is already ${transaction.status}`,
        code: "INVALID_STATUS",
      };
    }

    // Handle amount change (gas station style)
    const amountDifference =
      finalAmount !== undefined ? finalAmount - transaction.amount : 0;

    // Update balance if amount changed
    if (amountDifference !== 0) {
      const balanceChange =
        transaction.type === "credit" ? amountDifference : -amountDifference;
      await prisma.account.update({
        where: { id: transaction.accountId },
        data: { balance: { increment: balanceChange } },
      });
    }

    // Update transaction to posted
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: "posted",
        amount: finalAmount ?? transaction.amount,
        postedAt: new Date(),
      },
    });

    logger.info(`Posted transaction ${transactionId}`, {
      originalAmount: transaction.amount,
      finalAmount: updatedTransaction.amount,
    });

    return { success: true, transaction: updatedTransaction };
  } catch (error) {
    logger.error("Failed to post transaction", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      code: "POST_ERROR",
    };
  }
}

/**
 * Cancel a pending transaction
 */
export async function cancelTransaction(
  transactionId: string,
  reason?: string,
): Promise<TransactionResult> {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { account: true },
    });

    if (!transaction) {
      return {
        success: false,
        error: "Transaction not found",
        code: "TRANSACTION_NOT_FOUND",
      };
    }

    if (transaction.status !== "pending") {
      return {
        success: false,
        error: `Cannot cancel ${transaction.status} transaction`,
        code: "INVALID_STATUS",
      };
    }

    // Reverse the balance hold
    const balanceChange =
      transaction.type === "credit" ? -transaction.amount : transaction.amount;
    await prisma.account.update({
      where: { id: transaction.accountId },
      data: { balance: { increment: balanceChange } },
    });

    // Update transaction to canceled
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: "canceled",
        description: reason
          ? `${transaction.description || ""} [Canceled: ${reason}]`.trim()
          : transaction.description,
      },
    });

    logger.info(`Canceled transaction ${transactionId}`, { reason });

    return { success: true, transaction: updatedTransaction };
  } catch (error) {
    logger.error("Failed to cancel transaction", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      code: "CANCEL_ERROR",
    };
  }
}

/**
 * Process pending transactions that are ready to be posted
 */
export async function processPendingTransactions(): Promise<{
  posted: number;
  canceled: number;
  amountChanged: number;
}> {
  const config = getSimulationConfig();
  const rng = new SeededRandom(Date.now());

  // Find all pending transactions ready to post
  const pendingTransactions = await prisma.transaction.findMany({
    where: {
      status: "pending",
      postAt: { lte: new Date() },
    },
  });

  let posted = 0;
  let canceled = 0;
  let amountChanged = 0;

  for (const transaction of pendingTransactions) {
    // Randomly cancel some transactions
    if (rng.next() < config.cancelRate) {
      await cancelTransaction(transaction.id, "Merchant canceled");
      canceled++;
      continue;
    }

    // Randomly change amount for some transactions (gas station style)
    let finalAmount: number | undefined;
    if (rng.next() < config.amountChangeRate) {
      const changePercent =
        ((rng.next() * 2 - 1) * config.maxAmountChangePercent) / 100;
      finalAmount = Math.round(transaction.amount * (1 + changePercent));
      finalAmount = Math.max(100, finalAmount); // Minimum $1
      amountChanged++;
    }

    await postTransaction(transaction.id, finalAmount);
    posted++;
  }

  if (posted > 0 || canceled > 0) {
    logger.info("Processed pending transactions", {
      posted,
      canceled,
      amountChanged,
    });
  }

  return { posted, canceled, amountChanged };
}

/**
 * Generate a unique transaction reference
 */
function generateReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${timestamp}-${random}`;
}

/**
 * Get transaction lifecycle stats
 */
export async function getLifecycleStats(): Promise<{
  pending: number;
  posted: number;
  canceled: number;
  avgPendingAgeMs: number;
}> {
  const [pending, posted, canceled] = await Promise.all([
    prisma.transaction.count({ where: { status: "pending" } }),
    prisma.transaction.count({ where: { status: "posted" } }),
    prisma.transaction.count({ where: { status: "canceled" } }),
  ]);

  // Calculate average age of pending transactions
  const pendingTransactions = await prisma.transaction.findMany({
    where: { status: "pending" },
    select: { createdAt: true },
  });

  const avgPendingAgeMs =
    pendingTransactions.length > 0
      ? pendingTransactions.reduce(
          (sum, t) => sum + (Date.now() - t.createdAt.getTime()),
          0,
        ) / pendingTransactions.length
      : 0;

  return { pending, posted, canceled, avgPendingAgeMs };
}
