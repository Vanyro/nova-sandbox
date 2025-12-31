import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AccountQueryParams {
  page?: number;
  limit?: number;
  userId?: string;
  persona?: string;
  type?: string;
}

export async function accountRoutes(fastify: FastifyInstance) {
  // GET /accounts - List accounts with pagination and filters
  fastify.get(
    '/accounts',
    async (
      request: FastifyRequest<{ Querystring: AccountQueryParams }>,
      reply: FastifyReply
    ) => {
      try {
        const { userId, persona, type } = request.query;
        const page = Number(request.query.page) || 1;
        const limit = Number(request.query.limit) || 20;

        // Build where clause
        const where: any = {};
        if (userId) where.userId = userId;
        if (persona) where.persona = persona;
        if (type) where.type = type;

        // Get total count
        const total = await prisma.account.count({ where });

        // Get accounts with pagination
        const accounts = await prisma.account.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                persona: true,
              },
            },
            transactions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true },
            },
            _count: {
              select: { transactions: true },
            },
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        });

        // Compute stats for each account
        const accountsWithStats = await Promise.all(
          accounts.map(async (account) => {
            // Get credit/debit totals
            const stats = await prisma.transaction.groupBy({
              by: ['type'],
              where: { accountId: account.id },
              _sum: { amount: true },
            });

            const creditTotal =
              stats.find((s) => s.type === 'credit')?._sum.amount || 0;
            const debitTotal =
              stats.find((s) => s.type === 'debit')?._sum.amount || 0;

            // Calculate health score
            let healthScore = 'GOOD';
            if (account.balance < 0) {
              healthScore = 'CRITICAL';
            } else if (account.balance < 10000) {
              // Less than $100
              healthScore = 'WARNING';
            }

            return {
              id: account.id,
              userId: account.userId,
              type: account.type,
              balance: account.balance,
              balanceFormatted: `$${(account.balance / 100).toFixed(2)}`,
              persona: account.persona,
              riskLevel: account.riskLevel,
              createdAt: account.createdAt,
              lastTransactionDate:
                account.transactions[0]?.createdAt || null,
              transactionCount: account._count.transactions,
              creditTotal,
              debitTotal,
              healthScore,
              user: account.user,
            };
          })
        );

        reply.send({
          data: accountsWithStats,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to fetch accounts' });
      }
    }
  );

  // GET /accounts/:id - Get single account with detailed stats
  fastify.get(
    '/accounts/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;

        const account = await prisma.account.findUnique({
          where: { id },
          include: {
            user: true,
            transactions: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            _count: {
              select: { transactions: true },
            },
          },
        });

        if (!account) {
          return reply.status(404).send({ error: 'Account not found' });
        }

        // Get stats
        const stats = await prisma.transaction.groupBy({
          by: ['type'],
          where: { accountId: id },
          _sum: { amount: true },
        });

        const creditTotal =
          stats.find((s) => s.type === 'credit')?._sum.amount || 0;
        const debitTotal =
          stats.find((s) => s.type === 'debit')?._sum.amount || 0;

        reply.send({
          ...account,
          balanceFormatted: `$${(account.balance / 100).toFixed(2)}`,
          stats: {
            creditTotal,
            debitTotal,
            netFlow: creditTotal - debitTotal,
            transactionCount: account._count.transactions,
          },
        });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to fetch account' });
      }
    }
  );
}
