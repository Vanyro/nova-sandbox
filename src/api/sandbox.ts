/**
 * Sandbox API Routes
 * Developer tools for controlling the banking sandbox
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../core/logger.js';
import {
  getSimulationConfig,
  updateSimulationConfig,
  resetSimulationConfig,
  type ChaosMode,
} from '../core/simulationConfig.js';
import {
  startSimulation,
  stopSimulation,
  isSimulationRunning,
  getSimulationStats,
  triggerSimulationCycle,
} from '../worker/simulationEngine.js';
import {
  getLifecycleStats,
  processPendingTransactions,
} from '../core/transactionLifecycle.js';
import { getChaosStatus, resetFailuresInjected } from '../middleware/chaos.js';

const prisma = new PrismaClient();
const logger = createLogger('SandboxAPI');

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
    '/sandbox/mode',
    async (
      request: FastifyRequest<{ Body: ModeUpdateBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { mode, latencyMs, failureRate } = request.body;
        
        const validModes: ChaosMode[] = ['normal', 'latency', 'flaky', 'maintenance', 'corrupt'];
        if (!validModes.includes(mode)) {
          return reply.status(400).send({
            error: `Invalid mode. Must be one of: ${validModes.join(', ')}`,
          });
        }
        
        const updates: any = { chaosMode: mode };
        
        if (latencyMs !== undefined) {
          updates.latencyMs = latencyMs;
        }
        
        if (failureRate !== undefined) {
          if (failureRate < 0 || failureRate > 1) {
            return reply.status(400).send({
              error: 'failureRate must be between 0 and 1',
            });
          }
          updates.failureRate = failureRate;
        }
        
        const config = updateSimulationConfig(updates);
        
        // Update state in database
        await prisma.simulationState.upsert({
          where: { id: 'singleton' },
          create: { id: 'singleton', currentMode: mode },
          update: { currentMode: mode },
        });
        
        logger.info('Chaos mode updated', { mode, latencyMs, failureRate });
        
        reply.send({
          success: true,
          mode: config.chaosMode,
          latencyMs: config.latencyMs,
          failureRate: config.failureRate,
        });
      } catch (error) {
        logger.error('Failed to update chaos mode', error);
        reply.status(500).send({ error: 'Failed to update chaos mode' });
      }
    }
  );
  
  /**
   * GET /sandbox/mode - Get current chaos mode
   */
  fastify.get('/sandbox/mode', async (_request, reply) => {
    const status = getChaosStatus();
    reply.send(status);
  });
  
  /**
   * POST /sandbox/mode/reset - Reset to normal mode
   */
  fastify.post('/sandbox/mode/reset', async (_request, reply) => {
    resetSimulationConfig();
    resetFailuresInjected();
    
    await prisma.simulationState.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', currentMode: 'normal', failuresInjected: 0 },
      update: { currentMode: 'normal', failuresInjected: 0 },
    });
    
    logger.info('Chaos mode reset to normal');
    
    reply.send({
      success: true,
      message: 'Reset to normal mode',
      mode: 'normal',
    });
  });
  
  // ==================== ACCOUNT CONTROL ====================
  
  /**
   * PATCH /sandbox/account/:id/freeze - Freeze an account
   */
  fastify.patch(
    '/sandbox/account/:id/freeze',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        
        const account = await prisma.account.findUnique({ where: { id } });
        if (!account) {
          return reply.status(404).send({ error: 'Account not found' });
        }
        
        if (account.frozen) {
          return reply.status(400).send({ error: 'Account is already frozen' });
        }
        
        const updated = await prisma.account.update({
          where: { id },
          data: { frozen: true },
        });
        
        logger.info(`Account ${id} frozen`);
        
        reply.send({
          success: true,
          message: 'Account frozen successfully',
          account: {
            id: updated.id,
            frozen: updated.frozen,
          },
        });
      } catch (error) {
        logger.error('Failed to freeze account', error);
        reply.status(500).send({ error: 'Failed to freeze account' });
      }
    }
  );
  
  /**
   * PATCH /sandbox/account/:id/unfreeze - Unfreeze an account
   */
  fastify.patch(
    '/sandbox/account/:id/unfreeze',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        
        const account = await prisma.account.findUnique({ where: { id } });
        if (!account) {
          return reply.status(404).send({ error: 'Account not found' });
        }
        
        if (!account.frozen) {
          return reply.status(400).send({ error: 'Account is not frozen' });
        }
        
        const updated = await prisma.account.update({
          where: { id },
          data: { frozen: false },
        });
        
        logger.info(`Account ${id} unfrozen`);
        
        reply.send({
          success: true,
          message: 'Account unfrozen successfully',
          account: {
            id: updated.id,
            frozen: updated.frozen,
          },
        });
      } catch (error) {
        logger.error('Failed to unfreeze account', error);
        reply.status(500).send({ error: 'Failed to unfreeze account' });
      }
    }
  );
  
  /**
   * PATCH /sandbox/account/:id/set-balance - Set account balance directly
   */
  fastify.patch(
    '/sandbox/account/:id/set-balance',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: SetBalanceBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const { balance } = request.body;
        
        if (typeof balance !== 'number') {
          return reply.status(400).send({ error: 'Balance must be a number (in cents)' });
        }
        
        const account = await prisma.account.findUnique({ where: { id } });
        if (!account) {
          return reply.status(404).send({ error: 'Account not found' });
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
          message: 'Balance updated successfully',
          account: {
            id: updated.id,
            previousBalance,
            newBalance: updated.balance,
            balanceFormatted: `$${(updated.balance / 100).toFixed(2)}`,
          },
        });
      } catch (error) {
        logger.error('Failed to set balance', error);
        reply.status(500).send({ error: 'Failed to set balance' });
      }
    }
  );
  
  /**
   * PATCH /sandbox/account/:id/settings - Update account settings
   */
  fastify.patch(
    '/sandbox/account/:id/settings',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: AccountSettingsBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const { overdraftEnabled, dailyLimit } = request.body;
        
        const account = await prisma.account.findUnique({ where: { id } });
        if (!account) {
          return reply.status(404).send({ error: 'Account not found' });
        }
        
        const updates: any = {};
        if (overdraftEnabled !== undefined) updates.overdraftEnabled = overdraftEnabled;
        if (dailyLimit !== undefined) updates.dailyLimit = dailyLimit;
        
        const updated = await prisma.account.update({
          where: { id },
          data: updates,
        });
        
        logger.info(`Account ${id} settings updated`, updates);
        
        reply.send({
          success: true,
          message: 'Account settings updated',
          account: {
            id: updated.id,
            overdraftEnabled: updated.overdraftEnabled,
            dailyLimit: updated.dailyLimit,
            dailyLimitFormatted: `$${(updated.dailyLimit / 100).toFixed(2)}`,
          },
        });
      } catch (error) {
        logger.error('Failed to update account settings', error);
        reply.status(500).send({ error: 'Failed to update account settings' });
      }
    }
  );
  
  // ==================== SIMULATION CONTROL ====================
  
  /**
   * POST /sandbox/simulation/start - Start the simulation engine
   */
  fastify.post('/sandbox/simulation/start', async (_request, reply) => {
    try {
      if (isSimulationRunning()) {
        return reply.status(400).send({
          error: 'Simulation is already running',
        });
      }
      
      await startSimulation();
      
      reply.send({
        success: true,
        message: 'Simulation started',
        stats: await getSimulationStats(),
      });
    } catch (error) {
      logger.error('Failed to start simulation', error);
      reply.status(500).send({ error: 'Failed to start simulation' });
    }
  });
  
  /**
   * POST /sandbox/simulation/stop - Stop the simulation engine
   */
  fastify.post('/sandbox/simulation/stop', async (_request, reply) => {
    try {
      if (!isSimulationRunning()) {
        return reply.status(400).send({
          error: 'Simulation is not running',
        });
      }
      
      stopSimulation();
      
      reply.send({
        success: true,
        message: 'Simulation stopped',
        stats: await getSimulationStats(),
      });
    } catch (error) {
      logger.error('Failed to stop simulation', error);
      reply.status(500).send({ error: 'Failed to stop simulation' });
    }
  });
  
  /**
   * POST /sandbox/simulation/trigger - Manually trigger a simulation cycle
   */
  fastify.post('/sandbox/simulation/trigger', async (_request, reply) => {
    try {
      const result = await triggerSimulationCycle();
      
      reply.send({
        success: true,
        message: 'Simulation cycle triggered',
        result,
      });
    } catch (error) {
      logger.error('Failed to trigger simulation', error);
      reply.status(500).send({ error: 'Failed to trigger simulation' });
    }
  });
  
  /**
   * GET /sandbox/simulation/status - Get simulation status
   */
  fastify.get('/sandbox/simulation/status', async (_request, reply) => {
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
  fastify.post('/sandbox/transactions/process-pending', async (_request, reply) => {
    try {
      const result = await processPendingTransactions();
      
      reply.send({
        success: true,
        message: 'Pending transactions processed',
        result,
      });
    } catch (error) {
      logger.error('Failed to process pending transactions', error);
      reply.status(500).send({ error: 'Failed to process pending transactions' });
    }
  });
  
  // ==================== OBSERVABILITY ====================
  
  /**
   * GET /sandbox/stats - Get comprehensive sandbox statistics
   */
  fastify.get('/sandbox/stats', async (_request, reply) => {
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
      logger.error('Failed to get sandbox stats', error);
      reply.status(500).send({ error: 'Failed to get sandbox stats' });
    }
  });
  
  /**
   * GET /sandbox/health - Health check for sandbox systems
   */
  fastify.get('/sandbox/health', async (_request, reply) => {
    const config = getSimulationConfig();
    const chaosStatus = getChaosStatus();
    
    reply.send({
      status: 'ok',
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
  fastify.post('/sandbox/reset-stats', async (_request, reply) => {
    try {
      resetFailuresInjected();
      
      await prisma.simulationState.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', transactionsToday: 0, failuresInjected: 0 },
        update: { transactionsToday: 0, failuresInjected: 0 },
      });
      
      logger.info('Sandbox stats reset');
      
      reply.send({
        success: true,
        message: 'Sandbox statistics reset',
      });
    } catch (error) {
      logger.error('Failed to reset stats', error);
      reply.status(500).send({ error: 'Failed to reset stats' });
    }
  });
}
