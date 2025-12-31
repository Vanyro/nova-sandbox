import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

import { accountRoutes } from './api/accounts.js';
import { transactionRoutes } from './api/transactions.js';
import { statsRoutes } from './api/stats.js';
import { adminRoutes } from './api/admin.js';
import { sandboxRoutes } from './api/sandbox.js';
import { chaosMiddleware } from './middleware/chaos.js';
import { stopSimulation, startSimulation } from './worker/simulationEngine.js';

const prisma = new PrismaClient();
const fastify = Fastify({
  logger: true,
});

// Register chaos middleware (applies to all routes)
fastify.register(chaosMiddleware);

// Register routes
fastify.register(accountRoutes);
fastify.register(transactionRoutes);
fastify.register(statsRoutes);
fastify.register(adminRoutes);
fastify.register(sandboxRoutes);

fastify.get('/', async () => {
  return { status: 'Nova Sandbox Banking API v3.0 - Living Simulation' };
});
// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok' };
});

// Error handler
fastify.setErrorHandler((error, _request, reply) => {
  fastify.log.error(error);
  reply.status(500).send({ error: 'Internal Server Error' });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  fastify.log.info('Starting graceful shutdown...');
  stopSimulation();
  await prisma.$disconnect();
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4000', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    fastify.log.info(`Server listening on http://${host}:${port}`);
    
    // Auto-start simulation if enabled
    if (process.env.AUTO_START_SIMULATION === 'true') {
      fastify.log.info('Auto-starting simulation engine...');
      await startSimulation();
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
