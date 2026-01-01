/**
 * Portfolio/Investment API Routes
 * Endpoints for portfolio management and market data
 */

import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  createPortfolio,
  getUserPortfolios,
  getMarketOverview,
  getInvestmentSummary,
  updateMarketPrices,
  updatePortfolioValuations,
  initializeMarketAssets,
  type PortfolioType,
} from '../engines/investment.js';

const prisma = new PrismaClient();

export async function portfolioRoutes(fastify: FastifyInstance) {
  /**
   * GET /portfolio
   * Get overall investment summary
   */
  fastify.get('/', async () => {
    await initializeMarketAssets();
    return getInvestmentSummary();
  });

  /**
   * GET /portfolio/market
   * Get market overview with all assets
   */
  fastify.get('/market', async () => {
    await initializeMarketAssets();
    return getMarketOverview();
  });

  /**
   * GET /portfolio/assets
   * Get all market assets
   */
  fastify.get('/assets', async () => {
    await initializeMarketAssets();
    const assets = await prisma.marketAsset.findMany({
      orderBy: { symbol: 'asc' },
    });
    return { assets };
  });

  /**
   * GET /portfolio/assets/:symbol
   * Get specific asset details
   */
  fastify.get<{ Params: { symbol: string } }>('/assets/:symbol', async (request, reply) => {
    const { symbol } = request.params;

    const asset = await prisma.marketAsset.findUnique({
      where: { symbol: symbol.toUpperCase() },
    });

    if (!asset) {
      return reply.code(404).send({ error: 'Asset not found' });
    }

    return asset;
  });

  /**
   * GET /portfolio/users/:id
   * Get all portfolios for a user
   */
  fastify.get<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const portfolios = await getUserPortfolios(id);

    const totalInvested = portfolios.reduce((sum, p) => sum + p.totalInvested, 0);
    const totalValue = portfolios.reduce((sum, p) => sum + p.totalValue, 0);
    const totalGainLoss = portfolios.reduce((sum, p) => sum + p.totalGainLoss, 0);

    return {
      userId: id,
      userName: user.name,
      portfolioCount: portfolios.length,
      totalInvested,
      totalValue,
      totalGainLoss,
      totalReturn: totalInvested > 0 ? ((totalGainLoss / totalInvested) * 100).toFixed(2) + '%' : '0%',
      portfolios,
    };
  });

  /**
   * POST /portfolio/users/:id
   * Create a new portfolio for a user
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      type: PortfolioType;
      initialInvestment: number;
      name?: string;
    };
  }>('/users/:id', async (request, reply) => {
    const { id } = request.params;
    const { type, initialInvestment, name } = request.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // Validate portfolio type
    const validTypes: PortfolioType[] = ['conservative', 'balanced', 'aggressive', 'crypto'];
    if (!validTypes.includes(type)) {
      return reply.code(400).send({ error: `Invalid portfolio type. Valid types: ${validTypes.join(', ')}` });
    }

    // Validate initial investment
    if (!initialInvestment || initialInvestment < 10000) {
      return reply.code(400).send({ error: 'Initial investment must be at least $100 (10000 cents)' });
    }

    const portfolio = await createPortfolio(id, type, initialInvestment, name);

    return {
      message: 'Portfolio created successfully',
      portfolio,
    };
  });

  /**
   * GET /portfolio/:id
   * Get a specific portfolio
   */
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const portfolio = await prisma.portfolio.findUnique({
      where: { id },
      include: {
        holdings: {
          orderBy: { marketValue: 'desc' },
        },
        user: { select: { id: true, name: true } },
      },
    });

    if (!portfolio) {
      return reply.code(404).send({ error: 'Portfolio not found' });
    }

    return portfolio;
  });

  /**
   * POST /portfolio/market/update
   * Manually trigger market price update
   */
  fastify.post<{
    Body: { seed?: number; volatilityMultiplier?: number };
  }>('/market/update', async (request) => {
    const { seed, volatilityMultiplier } = request.body || {};

    const result = await updateMarketPrices(seed, volatilityMultiplier);
    await updatePortfolioValuations();

    return {
      message: 'Market prices updated',
      ...result,
    };
  });
}
