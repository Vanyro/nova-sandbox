import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface TransactionQueryParams {
  page?: number;
  limit?: number;
  accountId?: string;
  persona?: string;
  category?: string;
  type?: "credit" | "debit";
  sortBy?: "createdAt" | "amount";
  sortOrder?: "asc" | "desc";
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
}

export async function transactionRoutes(fastify: FastifyInstance) {
  // GET /transactions - List transactions with extensive filtering
  fastify.get(
    "/transactions",
    async (
      request: FastifyRequest<{ Querystring: TransactionQueryParams }>,
      reply: FastifyReply,
    ) => {
      try {
        const {
          accountId,
          persona,
          category,
          type,
          sortBy = "createdAt",
          sortOrder = "desc",
          dateFrom,
          dateTo,
        } = request.query;

        const page = Number(request.query.page) || 1;
        const limit = Number(request.query.limit) || 50;
        const minAmount = request.query.minAmount
          ? Number(request.query.minAmount)
          : undefined;
        const maxAmount = request.query.maxAmount
          ? Number(request.query.maxAmount)
          : undefined;

        // Build where clause
        const where: any = {};

        if (accountId) {
          where.accountId = accountId;
        }

        if (type) {
          where.type = type;
        }

        if (category) {
          where.category = category;
        }

        // Filter by persona (requires joining with account)
        if (persona) {
          where.account = {
            persona,
          };
        }

        // Date range filter
        if (dateFrom || dateTo) {
          where.createdAt = {};
          if (dateFrom) {
            where.createdAt.gte = new Date(dateFrom);
          }
          if (dateTo) {
            where.createdAt.lte = new Date(dateTo);
          }
        }

        // Amount range filter
        if (minAmount !== undefined || maxAmount !== undefined) {
          where.amount = {};
          if (minAmount !== undefined) {
            where.amount.gte = minAmount;
          }
          if (maxAmount !== undefined) {
            where.amount.lte = maxAmount;
          }
        }

        // Get total count
        const total = await prisma.transaction.count({ where });

        // Get transactions
        const transactions = await prisma.transaction.findMany({
          where,
          include: {
            account: {
              select: {
                id: true,
                type: true,
                persona: true,
                userId: true,
              },
            },
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: {
            [sortBy]: sortOrder,
          },
        });

        // Format transactions
        const formattedTransactions = transactions.map((txn) => ({
          ...txn,
          amountFormatted: `$${(txn.amount / 100).toFixed(2)}`,
          signedAmount: txn.type === "credit" ? txn.amount : -txn.amount,
          signedAmountFormatted: `${txn.type === "credit" ? "+" : "-"}$${(txn.amount / 100).toFixed(2)}`,
        }));

        reply.send({
          data: formattedTransactions,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
          filters: {
            accountId,
            persona,
            category,
            type,
            dateFrom,
            dateTo,
            minAmount,
            maxAmount,
          },
        });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: "Failed to fetch transactions" });
      }
    },
  );

  // GET /transactions/:id - Get single transaction
  fastify.get(
    "/transactions/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;

        const transaction = await prisma.transaction.findUnique({
          where: { id },
          include: {
            account: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        });

        if (!transaction) {
          return reply.status(404).send({ error: "Transaction not found" });
        }

        reply.send({
          ...transaction,
          amountFormatted: `$${(transaction.amount / 100).toFixed(2)}`,
          signedAmount:
            transaction.type === "credit"
              ? transaction.amount
              : -transaction.amount,
        });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: "Failed to fetch transaction" });
      }
    },
  );

  // GET /transactions/categories - Get list of all categories
  fastify.get("/transactions/categories", async (_request, reply) => {
    try {
      const categories = await prisma.transaction.findMany({
        select: { category: true },
        distinct: ["category"],
        where: {
          category: {
            not: null,
          },
        },
      });

      const categoryList = categories
        .map((c) => c.category)
        .filter(Boolean)
        .sort();

      reply.send({ categories: categoryList });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: "Failed to fetch categories" });
    }
  });
}
