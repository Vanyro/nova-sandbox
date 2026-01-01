import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { PrismaClient } from "@prisma/client";
import { seedDatabase, resetDatabase } from "../seed/index.js";
import { createLogger } from "../core/logger.js";

const prisma = new PrismaClient();
const logger = createLogger("AdminAPI");

export async function adminRoutes(fastify: FastifyInstance) {
  // POST /admin/reset - Reset database and optionally reseed
  fastify.post(
    "/admin/reset",
    async (
      request: FastifyRequest<{ Querystring: { reseed?: boolean } }>,
      reply: FastifyReply,
    ) => {
      try {
        logger.info("Reset endpoint called");

        const { reseed } = request.query;

        // Get counts before reset
        const beforeCounts = {
          users: await prisma.user.count(),
          accounts: await prisma.account.count(),
          transactions: await prisma.transaction.count(),
        };

        // Reset database
        await resetDatabase();

        let afterCounts = {
          users: 0,
          accounts: 0,
          transactions: 0,
        };

        // Optionally reseed
        if (reseed) {
          logger.info("Reseeding database...");
          await seedDatabase();

          afterCounts = {
            users: await prisma.user.count(),
            accounts: await prisma.account.count(),
            transactions: await prisma.transaction.count(),
          };
        }

        reply.send({
          success: true,
          message: reseed
            ? "Database reset and reseeded successfully"
            : "Database reset successfully",
          before: beforeCounts,
          after: afterCounts,
        });
      } catch (error) {
        logger.error("Reset failed", error);
        reply.status(500).send({
          success: false,
          error: "Failed to reset database",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // POST /admin/seed - Seed database (only if empty)
  fastify.post("/admin/seed", async (_request, reply) => {
    try {
      logger.info("Seed endpoint called");

      // Check if data exists
      const existingCount = await prisma.user.count();
      if (existingCount > 0) {
        return reply.status(400).send({
          success: false,
          error:
            "Database already contains data. Use /admin/reset?reseed=true to clear and reseed.",
        });
      }

      await seedDatabase();

      const counts = {
        users: await prisma.user.count(),
        accounts: await prisma.account.count(),
        transactions: await prisma.transaction.count(),
      };

      reply.send({
        success: true,
        message: "Database seeded successfully",
        counts,
      });
    } catch (error) {
      logger.error("Seed failed", error);
      reply.status(500).send({
        success: false,
        error: "Failed to seed database",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /admin/status - Get database status
  fastify.get("/admin/status", async (_request, reply) => {
    try {
      const counts = {
        users: await prisma.user.count(),
        accounts: await prisma.account.count(),
        transactions: await prisma.transaction.count(),
      };

      const personas = await prisma.account.groupBy({
        by: ["persona"],
        _count: true,
      });

      const dateRange = await prisma.transaction.aggregate({
        _min: { createdAt: true },
        _max: { createdAt: true },
      });

      reply.send({
        status: counts.users > 0 ? "seeded" : "empty",
        counts,
        personaBreakdown: personas.map((p) => ({
          persona: p.persona,
          count: p._count,
        })),
        dateRange: {
          earliest: dateRange._min.createdAt,
          latest: dateRange._max.createdAt,
        },
        environment: {
          seedMode: process.env.SEED_MODE || "realistic",
          seedKey: process.env.SEED_KEY ? "(set)" : "(default)",
        },
      });
    } catch (error) {
      logger.error("Status check failed", error);
      reply.status(500).send({
        success: false,
        error: "Failed to get status",
      });
    }
  });
}
