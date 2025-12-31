/**
 * Chaos Middleware for Banking Sandbox
 * Simulates real-world banking system instability
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { getSimulationConfig, type ChaosMode } from '../core/simulationConfig.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('ChaosMiddleware');

// Track failures for stats
let failuresInjected = 0;

export function getFailuresInjected(): number {
  return failuresInjected;
}

export function resetFailuresInjected(): void {
  failuresInjected = 0;
}

/**
 * Generate corrupted/malformed data response
 */
function generateCorruptedResponse(): object {
  const corruptions = [
    { dat: null, err: undefined, $undefined: 'NaN' },
    { data: [{ id: NaN, balance: 'not_a_number' }] },
    { response: { nested: { deeply: { broken: {} } } }, timestamp: 'invalid-date' },
    { accounts: [null, undefined, {}, { id: '' }] },
    { error: null, success: 'maybe', code: -999 },
  ];
  
  return corruptions[Math.floor(Math.random() * corruptions.length)];
}

/**
 * Chaos middleware implementation
 */
async function chaosMiddlewarePlugin(fastify: FastifyInstance): Promise<void> {
  // Use onRequest hook which runs before route handlers
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const config = getSimulationConfig();
    const { chaosMode, latencyMs, failureRate } = config;
    
    // Skip chaos for sandbox control endpoints
    if (request.url.startsWith('/sandbox/')) {
      return;
    }
    
    // Skip chaos for health endpoint
    if (request.url === '/health' || request.url === '/') {
      return;
    }
    
    switch (chaosMode) {
      case 'normal':
        return;
        
      case 'latency': {
        const delay = latencyMs || Math.floor(Math.random() * 6000) + 2000;
        logger.debug(`Chaos: Adding ${delay}ms latency`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return;
      }
      
      case 'flaky': {
        const rate = failureRate || (Math.random() * 0.1 + 0.2);
        if (Math.random() < rate) {
          failuresInjected++;
          logger.warn('Chaos: Injecting random failure');
          reply.status(500).send({
            error: 'Service temporarily unavailable',
            code: 'CHAOS_FLAKY_FAILURE',
            retryAfter: Math.floor(Math.random() * 30) + 5,
          });
          return reply;
        }
        return;
      }
      
      case 'maintenance': {
        failuresInjected++;
        logger.warn('Chaos: Maintenance mode - returning 503');
        reply.status(503).send({
          error: 'Bank system is currently under maintenance',
          code: 'BANK_MAINTENANCE',
          estimatedDowntime: '15 minutes',
          maintenanceWindow: {
            start: new Date().toISOString(),
            end: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          },
        });
        return reply;
      }
      
      case 'corrupt': {
        failuresInjected++;
        logger.warn('Chaos: Returning corrupted data');
        reply.status(200).send(generateCorruptedResponse());
        return reply;
      }
    }
  });
  
  logger.info('Chaos middleware registered');
}

// Export wrapped with fastify-plugin to break encapsulation
export const chaosMiddleware = fastifyPlugin(chaosMiddlewarePlugin, {
  name: 'chaos-middleware'
});

/**
 * Get current chaos mode status
 */
export function getChaosStatus(): {
  mode: ChaosMode;
  failuresInjected: number;
  latencyMs: number;
  failureRate: number;
} {
  const config = getSimulationConfig();
  return {
    mode: config.chaosMode,
    failuresInjected,
    latencyMs: config.latencyMs,
    failureRate: config.failureRate,
  };
}
