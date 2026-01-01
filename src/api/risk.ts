/**
 * Risk API Routes
 * Endpoints for risk management and monitoring
 */

import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  calculateUserRiskScore,
  logRiskEvent,
  getUserRiskEvents,
  getRiskSummary,
  type RiskLevel,
  type RiskEventType,
} from '../engines/risk.js';

const prisma = new PrismaClient();

export async function riskRoutes(fastify: FastifyInstance) {
  /**
   * GET /risk
   * Get overall risk summary
   */
  fastify.get('/', async () => {
    return getRiskSummary();
  });

  /**
   * GET /risk/users/:id
   * Get risk profile for a specific user
   */
  fastify.get<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const riskProfile = await calculateUserRiskScore(id);
    const recentEvents = await getUserRiskEvents(id, { limit: 10 });

    return {
      userId: id,
      userName: user.name,
      currentRiskScore: user.riskScore,
      riskProfile,
      recentEvents,
    };
  });

  /**
   * POST /risk/users/:id/recalculate
   * Recalculate and update risk score for a user
   */
  fastify.post<{ Params: { id: string } }>('/users/:id/recalculate', async (request, reply) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const riskProfile = await calculateUserRiskScore(id);

    return {
      userId: id,
      previousScore: user.riskScore,
      newScore: riskProfile.overallScore,
      level: riskProfile.level,
      factors: riskProfile.factors,
    };
  });

  /**
   * GET /risk/events
   * Get all risk events
   */
  fastify.get<{
    Querystring: { level?: string; limit?: string };
  }>('/events', async (request) => {
    const { level, limit } = request.query;

    const where: any = {};
    if (level) {
      where.level = level;
    }

    const events = await prisma.riskEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit) : 50,
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return { events };
  });

  /**
   * POST /risk/events
   * Manually log a risk event
   */
  fastify.post<{
    Body: {
      userId: string;
      level: RiskLevel;
      type: RiskEventType;
      description: string;
    };
  }>('/events', async (request, reply) => {
    const { userId, level, type, description } = request.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    await logRiskEvent(userId, type, level, description);

    return { success: true };
  });
}
