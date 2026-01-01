/**
 * Fraud API Routes
 * Endpoints for fraud detection and alerts
 */

import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import {
  createFraudAlert,
  freezeAccount,
  unfreezeAccount,
  getFraudSummary,
  type FraudAlertType,
  type FraudSeverity,
} from "../engines/fraud.js";

const prisma = new PrismaClient();

export async function fraudRoutes(fastify: FastifyInstance) {
  /**
   * GET /fraud
   * Get overall fraud summary
   */
  fastify.get("/", async () => {
    return getFraudSummary();
  });

  /**
   * GET /fraud/alerts
   * Get all fraud alerts
   */
  fastify.get<{
    Querystring: {
      severity?: string;
      status?: string;
      limit?: string;
    };
  }>("/alerts", async (request) => {
    const { severity, status, limit } = request.query;

    const where: any = {};

    if (severity) {
      where.severity = severity;
    }

    if (status) {
      where.status = status;
    }

    const alerts = await prisma.fraudAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit ? parseInt(limit) : 50,
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return { alerts };
  });

  /**
   * GET /fraud/alerts/:id
   * Get specific fraud alert
   */
  fastify.get<{ Params: { id: string } }>(
    "/alerts/:id",
    async (request, reply) => {
      const { id } = request.params;

      const alert = await prisma.fraudAlert.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true } },
        },
      });

      if (!alert) {
        return reply.code(404).send({ error: "Fraud alert not found" });
      }

      return alert;
    },
  );

  /**
   * POST /fraud/alerts/:id/resolve
   * Resolve a fraud alert
   */
  fastify.post<{
    Params: { id: string };
    Body: { resolution?: string };
  }>("/alerts/:id/resolve", async (request, reply) => {
    const { id } = request.params;
    const { resolution } = request.body || {};

    const alert = await prisma.fraudAlert.findUnique({ where: { id } });
    if (!alert) {
      return reply.code(404).send({ error: "Fraud alert not found" });
    }

    const updated = await prisma.fraudAlert.update({
      where: { id },
      data: {
        status: "dismissed",
        resolvedAt: new Date(),
        actionTaken: resolution || "resolved",
      },
    });

    return updated;
  });

  /**
   * POST /fraud/alerts
   * Create a manual fraud alert
   */
  fastify.post<{
    Body: {
      userId: string;
      transactionId?: string;
      type: FraudAlertType;
      severity: FraudSeverity;
      description: string;
    };
  }>("/alerts", async (request, reply) => {
    const { userId, transactionId, type, severity, description } = request.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    const alert = await createFraudAlert(
      userId,
      type,
      severity,
      description,
      { source: "manual" },
      transactionId,
    );

    return alert;
  });

  /**
   * GET /fraud/users/:id
   * Get fraud alerts for a specific user
   */
  fastify.get<{ Params: { id: string } }>(
    "/users/:id",
    async (request, reply) => {
      const { id } = request.params;

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }

      const alerts = await prisma.fraudAlert.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
      });

      const frozenAccounts = await prisma.account.count({
        where: { userId: id, frozen: true },
      });

      return {
        userId: id,
        userName: user.name,
        alertCount: alerts.length,
        unresolvedAlerts: alerts.filter(
          (a) => a.status === "open" || a.status === "investigating",
        ).length,
        frozenAccounts,
        alerts,
      };
    },
  );

  /**
   * POST /fraud/accounts/:id/freeze
   * Freeze an account due to fraud
   */
  fastify.post<{
    Params: { id: string };
    Body: { reason: string };
  }>("/accounts/:id/freeze", async (request, reply) => {
    const { id } = request.params;
    const { reason } = request.body;

    if (!reason) {
      return reply.code(400).send({ error: "Reason is required" });
    }

    const account = await prisma.account.findUnique({ where: { id } });
    if (!account) {
      return reply.code(404).send({ error: "Account not found" });
    }

    await freezeAccount(id, reason);

    return {
      message: "Account frozen",
      accountId: id,
    };
  });

  /**
   * POST /fraud/accounts/:id/unfreeze
   * Unfreeze an account
   */
  fastify.post<{ Params: { id: string } }>(
    "/accounts/:id/unfreeze",
    async (request, reply) => {
      const { id } = request.params;

      const account = await prisma.account.findUnique({ where: { id } });
      if (!account) {
        return reply.code(404).send({ error: "Account not found" });
      }

      await unfreezeAccount(id);

      return {
        message: "Account unfrozen",
        accountId: id,
      };
    },
  );

  /**
   * GET /fraud/frozen-accounts
   * Get all frozen accounts
   */
  fastify.get("/frozen-accounts", async () => {
    const accounts = await prisma.account.findMany({
      where: { frozen: true },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return {
      frozenCount: accounts.length,
      accounts,
    };
  });
}
