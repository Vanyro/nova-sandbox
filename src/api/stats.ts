import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface StatsQueryParams {
  accountId?: string;
  persona?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function statsRoutes(fastify: FastifyInstance) {
  // GET /stats - Get overall statistics
  fastify.get(
    '/stats',
    async (
      request: FastifyRequest<{ Querystring: StatsQueryParams }>,
      reply: FastifyReply
    ) => {
      try {
        const { accountId, persona, dateFrom, dateTo } = request.query;

        // Build where clause for transactions
        const where: any = {};

        if (accountId) {
          where.accountId = accountId;
        }

        if (persona) {
          where.account = { persona };
        }

        if (dateFrom || dateTo) {
          where.createdAt = {};
          if (dateFrom) {
            where.createdAt.gte = new Date(dateFrom);
          }
          if (dateTo) {
            where.createdAt.lte = new Date(dateTo);
          }
        }

        // Get total counts
        const totalTransactions = await prisma.transaction.count({ where });

        // Get credit/debit totals
        const typeStats = await prisma.transaction.groupBy({
          by: ['type'],
          where,
          _sum: { amount: true },
          _count: true,
        });

        const creditData = typeStats.find((s) => s.type === 'credit');
        const debitData = typeStats.find((s) => s.type === 'debit');

        const totalCredits = creditData?._sum.amount || 0;
        const totalDebits = debitData?._sum.amount || 0;
        const creditCount = creditData?._count || 0;
        const debitCount = debitData?._count || 0;

        // Get category breakdown
        const categoryStats = await prisma.transaction.groupBy({
          by: ['category', 'type'],
          where,
          _sum: { amount: true },
          _count: true,
        });

        const categoryBreakdown = categoryStats.map((stat) => ({
          category: stat.category,
          type: stat.type,
          total: stat._sum.amount || 0,
          totalFormatted: `$${((stat._sum.amount || 0) / 100).toFixed(2)}`,
          count: stat._count,
          average: stat._count
            ? Math.round((stat._sum.amount || 0) / stat._count)
            : 0,
          averageFormatted: stat._count
            ? `$${(((stat._sum.amount || 0) / stat._count) / 100).toFixed(2)}`
            : '$0.00',
        }));

        // Get monthly totals using Prisma native query
        const transactions = await prisma.transaction.findMany({
          where,
          select: {
            type: true,
            amount: true,
            createdAt: true,
          },
        });

        // Aggregate monthly data in JavaScript
        const monthlyMap = new Map<string, { credits: number; debits: number; creditCount: number; debitCount: number }>();
        
        for (const txn of transactions) {
          const month = txn.createdAt.toISOString().slice(0, 7); // YYYY-MM
          const existing = monthlyMap.get(month) || { credits: 0, debits: 0, creditCount: 0, debitCount: 0 };
          
          if (txn.type === 'credit') {
            existing.credits += txn.amount;
            existing.creditCount += 1;
          } else {
            existing.debits += txn.amount;
            existing.debitCount += 1;
          }
          
          monthlyMap.set(month, existing);
        }

        const monthlyData = Array.from(monthlyMap.entries())
          .map(([month, data]) => ({
            month,
            ...data,
          }))
          .sort((a, b) => b.month.localeCompare(a.month));

        // Add computed fields to monthly data
        const monthlyDataFormatted = monthlyData.map((m) => ({
          ...m,
          netFlow: m.credits - m.debits,
          netFlowFormatted: `$${((m.credits - m.debits) / 100).toFixed(2)}`,
          creditsFormatted: `$${(m.credits / 100).toFixed(2)}`,
          debitsFormatted: `$${(m.debits / 100).toFixed(2)}`,
        }));

        reply.send({
          summary: {
            totalTransactions,
            totalCredits,
            totalDebits,
            netFlow: totalCredits - totalDebits,
            creditCount,
            debitCount,
            averageCredit: creditCount
              ? Math.round(totalCredits / creditCount)
              : 0,
            averageDebit: debitCount
              ? Math.round(totalDebits / debitCount)
              : 0,
            // Formatted versions
            totalCreditsFormatted: `$${(totalCredits / 100).toFixed(2)}`,
            totalDebitsFormatted: `$${(totalDebits / 100).toFixed(2)}`,
            netFlowFormatted: `$${((totalCredits - totalDebits) / 100).toFixed(2)}`,
            averageCreditFormatted: creditCount
              ? `$${(totalCredits / creditCount / 100).toFixed(2)}`
              : '$0.00',
            averageDebitFormatted: debitCount
              ? `$${(totalDebits / debitCount / 100).toFixed(2)}`
              : '$0.00',
          },
          categoryBreakdown,
          monthlyData: monthlyDataFormatted,
          filters: {
            accountId,
            persona,
            dateFrom,
            dateTo,
          },
        });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: 'Failed to fetch statistics' });
      }
    }
  );

  // GET /stats/personas - Get statistics by persona
  fastify.get('/stats/personas', async (_request, reply) => {
    try {
      const personas = await prisma.account.groupBy({
        by: ['persona'],
        _count: true,
        _sum: { balance: true },
      });

      const personaStats = await Promise.all(
        personas.map(async (p) => {
          const transactionStats = await prisma.transaction.groupBy({
            by: ['type'],
            where: {
              account: {
                persona: p.persona,
              },
            },
            _sum: { amount: true },
            _count: true,
          });

          const creditData = transactionStats.find(
            (s) => s.type === 'credit'
          );
          const debitData = transactionStats.find((s) => s.type === 'debit');

          return {
            persona: p.persona,
            accountCount: p._count,
            totalBalance: p._sum.balance || 0,
            totalBalanceFormatted: `$${((p._sum.balance || 0) / 100).toFixed(2)}`,
            credits: creditData?._sum.amount || 0,
            debits: debitData?._sum.amount || 0,
            transactionCount:
              (creditData?._count || 0) + (debitData?._count || 0),
          };
        })
      );

      reply.send({ personas: personaStats });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch persona statistics' });
    }
  });
}
