/**
 * Sandbox API Routes
 * Developer tools for controlling the banking sandbox
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";
import { createLogger } from "../core/logger.js";
import {
  getSimulationConfig,
  updateSimulationConfig,
  resetSimulationConfig,
  type ChaosMode,
} from "../core/simulationConfig.js";
import {
  startSimulation,
  stopSimulation,
  isSimulationRunning,
  getSimulationStats,
  triggerSimulationCycle,
} from "../worker/simulationEngine.js";
import {
  getLifecycleStats,
  processPendingTransactions,
} from "../core/transactionLifecycle.js";
import { getChaosStatus, resetFailuresInjected } from "../middleware/chaos.js";
import { triggerFraudEvent, getFraudSummary } from "../engines/fraud.js";
import {
  triggerMarketCrash,
  triggerMarketRecovery,
  updateMarketPrices,
  updatePortfolioValuations,
} from "../engines/investment.js";
import { processDueLoanPayments, getLoanSummary } from "../engines/loans.js";
import { calculateUserRiskScore } from "../engines/risk.js";
import { runScheduledComplianceChecks } from "../engines/compliance.js";

const prisma = new PrismaClient();
const logger = createLogger("SandboxAPI");

interface ModeUpdateBody {
  mode: ChaosMode;
  latencyMs?: number;
  failureRate?: number;
}

interface SetBalanceBody {
  balance: number;
}

interface AccountSettingsBody {
  overdraftEnabled?: boolean;
  dailyLimit?: number;
}

export async function sandboxRoutes(fastify: FastifyInstance) {
  // ==================== CHAOS MODE CONTROL ====================

  /**
   * PATCH /sandbox/mode - Update chaos mode
   */
  fastify.patch(
    "/sandbox/mode",
    async (
      request: FastifyRequest<{ Body: ModeUpdateBody }>,
      reply: FastifyReply,
    ) => {
      try {
        const { mode, latencyMs, failureRate } = request.body;

        const validModes: ChaosMode[] = [
          "normal",
          "latency",
          "flaky",
          "maintenance",
          "corrupt",
        ];
        if (!validModes.includes(mode)) {
          return reply.status(400).send({
            error: `Invalid mode. Must be one of: ${validModes.join(", ")}`,
          });
        }

        const updates: any = { chaosMode: mode };

        if (latencyMs !== undefined) {
          updates.latencyMs = latencyMs;
        }

        if (failureRate !== undefined) {
          if (failureRate < 0 || failureRate > 1) {
            return reply.status(400).send({
              error: "failureRate must be between 0 and 1",
            });
          }
          updates.failureRate = failureRate;
        }

        const config = updateSimulationConfig(updates);

        // Update state in database
        await prisma.simulationState.upsert({
          where: { id: "singleton" },
          create: { id: "singleton", currentMode: mode },
          update: { currentMode: mode },
        });

        logger.info("Chaos mode updated", { mode, latencyMs, failureRate });

        reply.send({
          success: true,
          mode: config.chaosMode,
          latencyMs: config.latencyMs,
          failureRate: config.failureRate,
        });
      } catch (error) {
        logger.error("Failed to update chaos mode", error);
        reply.status(500).send({ error: "Failed to update chaos mode" });
      }
    },
  );

  /**
   * GET /sandbox/mode - Get current chaos mode
   */
  fastify.get("/sandbox/mode", async (_request, reply) => {
    const status = getChaosStatus();
    reply.send(status);
  });

  /**
   * POST /sandbox/mode/reset - Reset to normal mode
   */
  fastify.post("/sandbox/mode/reset", async (_request, reply) => {
    resetSimulationConfig();
    resetFailuresInjected();

    await prisma.simulationState.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", currentMode: "normal", failuresInjected: 0 },
      update: { currentMode: "normal", failuresInjected: 0 },
    });

    logger.info("Chaos mode reset to normal");

    reply.send({
      success: true,
      message: "Reset to normal mode",
      mode: "normal",
    });
  });

  // ==================== ACCOUNT CONTROL ====================

  /**
   * PATCH /sandbox/account/:id/freeze - Freeze an account
   */
  fastify.patch(
    "/sandbox/account/:id/freeze",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;

        const account = await prisma.account.findUnique({ where: { id } });
        if (!account) {
          return reply.status(404).send({ error: "Account not found" });
        }

        if (account.frozen) {
          return reply.status(400).send({ error: "Account is already frozen" });
        }

        const updated = await prisma.account.update({
          where: { id },
          data: { frozen: true },
        });

        logger.info(`Account ${id} frozen`);

        reply.send({
          success: true,
          message: "Account frozen successfully",
          account: {
            id: updated.id,
            frozen: updated.frozen,
          },
        });
      } catch (error) {
        logger.error("Failed to freeze account", error);
        reply.status(500).send({ error: "Failed to freeze account" });
      }
    },
  );

  /**
   * PATCH /sandbox/account/:id/unfreeze - Unfreeze an account
   */
  fastify.patch(
    "/sandbox/account/:id/unfreeze",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;

        const account = await prisma.account.findUnique({ where: { id } });
        if (!account) {
          return reply.status(404).send({ error: "Account not found" });
        }

        if (!account.frozen) {
          return reply.status(400).send({ error: "Account is not frozen" });
        }

        const updated = await prisma.account.update({
          where: { id },
          data: { frozen: false },
        });

        logger.info(`Account ${id} unfrozen`);

        reply.send({
          success: true,
          message: "Account unfrozen successfully",
          account: {
            id: updated.id,
            frozen: updated.frozen,
          },
        });
      } catch (error) {
        logger.error("Failed to unfreeze account", error);
        reply.status(500).send({ error: "Failed to unfreeze account" });
      }
    },
  );

  /**
   * PATCH /sandbox/account/:id/set-balance - Set account balance directly
   */
  fastify.patch(
    "/sandbox/account/:id/set-balance",
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: SetBalanceBody }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;
        const { balance } = request.body;

        if (typeof balance !== "number") {
          return reply
            .status(400)
            .send({ error: "Balance must be a number (in cents)" });
        }

        const account = await prisma.account.findUnique({ where: { id } });
        if (!account) {
          return reply.status(404).send({ error: "Account not found" });
        }

        const previousBalance = account.balance;

        const updated = await prisma.account.update({
          where: { id },
          data: { balance },
        });

        logger.info(`Account ${id} balance set`, {
          previous: previousBalance,
          new: balance,
        });

        reply.send({
          success: true,
          message: "Balance updated successfully",
          account: {
            id: updated.id,
            previousBalance,
            newBalance: updated.balance,
            balanceFormatted: `$${(updated.balance / 100).toFixed(2)}`,
          },
        });
      } catch (error) {
        logger.error("Failed to set balance", error);
        reply.status(500).send({ error: "Failed to set balance" });
      }
    },
  );

  /**
   * PATCH /sandbox/account/:id/settings - Update account settings
   */
  fastify.patch(
    "/sandbox/account/:id/settings",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: AccountSettingsBody;
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;
        const { overdraftEnabled, dailyLimit } = request.body;

        const account = await prisma.account.findUnique({ where: { id } });
        if (!account) {
          return reply.status(404).send({ error: "Account not found" });
        }

        const updates: any = {};
        if (overdraftEnabled !== undefined)
          updates.overdraftEnabled = overdraftEnabled;
        if (dailyLimit !== undefined) updates.dailyLimit = dailyLimit;

        const updated = await prisma.account.update({
          where: { id },
          data: updates,
        });

        logger.info(`Account ${id} settings updated`, updates);

        reply.send({
          success: true,
          message: "Account settings updated",
          account: {
            id: updated.id,
            overdraftEnabled: updated.overdraftEnabled,
            dailyLimit: updated.dailyLimit,
            dailyLimitFormatted: `$${(updated.dailyLimit / 100).toFixed(2)}`,
          },
        });
      } catch (error) {
        logger.error("Failed to update account settings", error);
        reply.status(500).send({ error: "Failed to update account settings" });
      }
    },
  );

  // ==================== SIMULATION CONTROL ====================

  /**
   * POST /sandbox/simulation/start - Start the simulation engine
   */
  fastify.post("/sandbox/simulation/start", async (_request, reply) => {
    try {
      if (isSimulationRunning()) {
        return reply.status(400).send({
          error: "Simulation is already running",
        });
      }

      await startSimulation();

      reply.send({
        success: true,
        message: "Simulation started",
        stats: await getSimulationStats(),
      });
    } catch (error) {
      logger.error("Failed to start simulation", error);
      reply.status(500).send({ error: "Failed to start simulation" });
    }
  });

  /**
   * POST /sandbox/simulation/stop - Stop the simulation engine
   */
  fastify.post("/sandbox/simulation/stop", async (_request, reply) => {
    try {
      if (!isSimulationRunning()) {
        return reply.status(400).send({
          error: "Simulation is not running",
        });
      }

      stopSimulation();

      reply.send({
        success: true,
        message: "Simulation stopped",
        stats: await getSimulationStats(),
      });
    } catch (error) {
      logger.error("Failed to stop simulation", error);
      reply.status(500).send({ error: "Failed to stop simulation" });
    }
  });

  /**
   * POST /sandbox/simulation/trigger - Manually trigger a simulation cycle
   */
  fastify.post("/sandbox/simulation/trigger", async (_request, reply) => {
    try {
      const result = await triggerSimulationCycle();

      reply.send({
        success: true,
        message: "Simulation cycle triggered",
        result,
      });
    } catch (error) {
      logger.error("Failed to trigger simulation", error);
      reply.status(500).send({ error: "Failed to trigger simulation" });
    }
  });

  /**
   * GET /sandbox/simulation/status - Get simulation status
   */
  fastify.get("/sandbox/simulation/status", async (_request, reply) => {
    const stats = await getSimulationStats();
    const config = getSimulationConfig();

    reply.send({
      ...stats,
      config: {
        mode: config.mode,
        intervalMs: config.intervalMs,
        pendingDurationMs: config.pendingDurationMs,
      },
    });
  });

  // ==================== TRANSACTION LIFECYCLE ====================

  /**
   * POST /sandbox/transactions/process-pending - Process pending transactions
   */
  fastify.post(
    "/sandbox/transactions/process-pending",
    async (_request, reply) => {
      try {
        const result = await processPendingTransactions();

        reply.send({
          success: true,
          message: "Pending transactions processed",
          result,
        });
      } catch (error) {
        logger.error("Failed to process pending transactions", error);
        reply
          .status(500)
          .send({ error: "Failed to process pending transactions" });
      }
    },
  );

  // ==================== OBSERVABILITY ====================

  /**
   * GET /sandbox/stats - Get comprehensive sandbox statistics
   */
  fastify.get("/sandbox/stats", async (_request, reply) => {
    try {
      // Get simulation stats
      const simulationStats = await getSimulationStats();

      // Get transaction lifecycle stats
      const lifecycleStats = await getLifecycleStats();

      // Get chaos status
      const chaosStatus = getChaosStatus();

      // Get today's transaction count
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const transactionsToday = await prisma.transaction.count({
        where: {
          createdAt: { gte: today },
        },
      });

      // Get total transactions
      const totalTransactions = await prisma.transaction.count();

      // Get account stats
      const accountStats = await prisma.account.aggregate({
        _count: true,
        _sum: { balance: true },
      });

      const frozenAccounts = await prisma.account.count({
        where: { frozen: true },
      });

      // Get user count
      const userCount = await prisma.user.count();

      reply.send({
        timestamp: new Date().toISOString(),
        simulation: {
          isRunning: simulationStats.isRunning,
          lastRunAt: simulationStats.lastRunAt,
          transactionsGeneratedToday: transactionsToday,
          mode: simulationStats.currentMode,
        },
        transactions: {
          total: totalTransactions,
          today: transactionsToday,
          pending: lifecycleStats.pending,
          posted: lifecycleStats.posted,
          canceled: lifecycleStats.canceled,
          avgPendingAgeMs: Math.round(lifecycleStats.avgPendingAgeMs),
        },
        chaos: {
          mode: chaosStatus.mode,
          failuresInjected: chaosStatus.failuresInjected,
          latencyMs: chaosStatus.latencyMs,
          failureRate: chaosStatus.failureRate,
        },
        accounts: {
          total: accountStats._count,
          frozen: frozenAccounts,
          totalBalance: accountStats._sum.balance || 0,
          totalBalanceFormatted: `$${((accountStats._sum.balance || 0) / 100).toFixed(2)}`,
        },
        users: {
          total: userCount,
        },
      });
    } catch (error) {
      logger.error("Failed to get sandbox stats", error);
      reply.status(500).send({ error: "Failed to get sandbox stats" });
    }
  });

  /**
   * GET /sandbox/health - Health check for sandbox systems
   */
  fastify.get("/sandbox/health", async (_request, reply) => {
    const config = getSimulationConfig();
    const chaosStatus = getChaosStatus();

    reply.send({
      status: "ok",
      timestamp: new Date().toISOString(),
      simulationRunning: isSimulationRunning(),
      chaosMode: chaosStatus.mode,
      config: {
        simulationMode: config.mode,
        intervalMs: config.intervalMs,
      },
    });
  });

  /**
   * POST /sandbox/reset-stats - Reset sandbox statistics
   */
  fastify.post("/sandbox/reset-stats", async (_request, reply) => {
    try {
      resetFailuresInjected();

      await prisma.simulationState.upsert({
        where: { id: "singleton" },
        create: { id: "singleton", transactionsToday: 0, failuresInjected: 0 },
        update: { transactionsToday: 0, failuresInjected: 0 },
      });

      logger.info("Sandbox stats reset");

      reply.send({
        success: true,
        message: "Sandbox statistics reset",
      });
    } catch (error) {
      logger.error("Failed to reset stats", error);
      reply.status(500).send({ error: "Failed to reset stats" });
    }
  });

  // ==================== PHASE 4: SIMULATION TRIGGERS ====================

  /**
   * POST /sandbox/day/advance - Advance simulation by one day
   */
  fastify.post<{
    Body: { seed?: number };
  }>("/sandbox/day/advance", async (request, reply) => {
    try {
      const { seed } = request.body || {};

      logger.section("Advancing Simulation Day");

      // Get current state
      const state = await prisma.simulationState.findUnique({
        where: { id: "singleton" },
      });

      // Advance by one day
      const currentDay = state?.currentDay || new Date();
      const newDay = new Date(currentDay.getTime() + 24 * 60 * 60 * 1000);

      // 1. Update market prices
      const marketUpdate = await updateMarketPrices(seed);
      await updatePortfolioValuations();

      // 2. Process due loan payments
      const loanPayments = await processDueLoanPayments();

      // 3. Run compliance checks
      const complianceChecks = await runScheduledComplianceChecks();

      // 4. Recalculate risk scores for active users
      const users = await prisma.user.findMany({ take: 50 });
      let riskUpdates = 0;
      for (const user of users) {
        const profile = await calculateUserRiskScore(user.id);
        await prisma.user.update({
          where: { id: user.id },
          data: { riskScore: profile.overallScore },
        });
        riskUpdates++;
      }

      // Update simulation state
      await prisma.simulationState.upsert({
        where: { id: "singleton" },
        update: {
          currentDay: newDay,
        },
        create: {
          id: "singleton",
          isRunning: false,
          currentDay: newDay,
        },
      });

      logger.info(`Simulation day advanced to ${newDay.toISOString()}`);

      reply.send({
        message: `Simulation day advanced`,
        previousDay: currentDay,
        currentDay: newDay,
        results: {
          marketUpdate,
          loanPayments,
          complianceChecks,
          riskUpdates,
        },
      });
    } catch (error) {
      logger.error("Failed to advance day", error);
      reply.status(500).send({ error: "Failed to advance simulation day" });
    }
  });

  /**
   * POST /sandbox/trigger/fraud - Trigger a fraud event simulation
   */
  fastify.post<{
    Body: {
      userId?: string;
      severity?: "low" | "medium" | "high" | "critical";
    };
  }>("/sandbox/trigger/fraud", async (request, reply) => {
    try {
      const { userId } = request.body || {};

      // If no userId, pick a random user
      let targetUserId = userId;
      if (!targetUserId) {
        const users = await prisma.user.findMany({ take: 10 });
        if (users.length === 0) {
          return reply
            .status(400)
            .send({ error: "No users found in database" });
        }
        const randomUser = users[Math.floor(Math.random() * users.length)];
        targetUserId = randomUser?.id;
      }

      const result = await triggerFraudEvent(targetUserId);

      reply.send({
        message: "Fraud event triggered",
        ...result,
      });
    } catch (error) {
      logger.error("Failed to trigger fraud event", error);
      reply.status(500).send({ error: "Failed to trigger fraud event" });
    }
  });

  /**
   * POST /sandbox/trigger/market-crash - Trigger a market crash event
   */
  fastify.post<{
    Body: {
      severity?: "mild" | "moderate" | "severe";
    };
  }>("/sandbox/trigger/market-crash", async (request, reply) => {
    try {
      const { severity = "moderate" } = request.body || {};

      const result = await triggerMarketCrash(severity);

      reply.send({
        message: `Market crash triggered (${severity})`,
        ...result,
      });
    } catch (error) {
      logger.error("Failed to trigger market crash", error);
      reply.status(500).send({ error: "Failed to trigger market crash" });
    }
  });

  /**
   * POST /sandbox/trigger/market-recovery - Trigger market recovery
   */
  fastify.post<{
    Body: {
      recoveryPercent?: number;
    };
  }>("/sandbox/trigger/market-recovery", async (request, reply) => {
    try {
      const { recoveryPercent = 0.1 } = request.body || {};

      const result = await triggerMarketRecovery(recoveryPercent);

      reply.send({
        message: "Market recovery triggered",
        ...result,
      });
    } catch (error) {
      logger.error("Failed to trigger market recovery", error);
      reply.status(500).send({ error: "Failed to trigger market recovery" });
    }
  });

  /**
   * POST /sandbox/reset-user/:id - Reset a specific user to clean state
   */
  fastify.post<{ Params: { id: string } }>(
    "/sandbox/reset-user/:id",
    async (request, reply) => {
      try {
        const { id } = request.params;

        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }

        // Reset user fields
        await prisma.user.update({
          where: { id },
          data: {
            riskScore: 50,
            kycStatus: "verified",
            amlStatus: "clear",
            sanctionStatus: "clear",
          },
        });

        // Unfreeze all accounts
        await prisma.account.updateMany({
          where: { userId: id },
          data: {
            frozen: false,
            frozenReason: null,
            frozenAt: null,
            overdraftUsed: 0,
          },
        });

        // Clear fraud alerts
        await prisma.fraudAlert.deleteMany({
          where: { userId: id },
        });

        // Clear risk events
        await prisma.riskEvent.deleteMany({
          where: { userId: id },
        });

        // Clear compliance logs
        await prisma.complianceLog.deleteMany({
          where: { userId: id },
        });

        logger.info(`User ${id} reset to clean state`);

        reply.send({
          message: "User reset to clean state",
          userId: id,
          userName: user.name,
        });
      } catch (error) {
        logger.error("Failed to reset user", error);
        reply.status(500).send({ error: "Failed to reset user" });
      }
    },
  );

  /**
   * GET /sandbox/summary - Get a comprehensive summary of the sandbox state
   */
  fastify.get("/sandbox/summary", async (_request, reply) => {
    try {
      const loanSummary = await getLoanSummary();
      const fraudSummary = await getFraudSummary();

      const state = await prisma.simulationState.findUnique({
        where: { id: "singleton" },
      });

      const userStats = await prisma.user.groupBy({
        by: ["persona"],
        _count: true,
      });

      const accountStats = await prisma.account.aggregate({
        _sum: { balance: true },
        _count: true,
        _avg: { balance: true },
      });

      const transactionStats = await prisma.transaction.aggregate({
        _sum: { amount: true },
        _count: true,
        _avg: { amount: true },
      });

      reply.send({
        simulation: {
          currentDay: state?.currentDay || new Date(),
          isRunning: state?.isRunning || false,
          marketCrashActive: state?.marketCrashActive || false,
          fraudEventActive: state?.fraudEventActive || false,
        },
        users: {
          total: userStats.reduce((sum, g) => sum + g._count, 0),
          byPersona: Object.fromEntries(
            userStats.map((g) => [g.persona, g._count]),
          ),
        },
        accounts: {
          total: accountStats._count,
          totalBalance: accountStats._sum.balance || 0,
          avgBalance: Math.floor(accountStats._avg.balance || 0),
        },
        transactions: {
          total: transactionStats._count,
          totalVolume: transactionStats._sum.amount || 0,
          avgAmount: Math.floor(transactionStats._avg.amount || 0),
        },
        loans: loanSummary,
        fraud: fraudSummary,
      });
    } catch (error) {
      logger.error("Failed to get sandbox summary", error);
      reply.status(500).send({ error: "Failed to get sandbox summary" });
    }
  });
}
