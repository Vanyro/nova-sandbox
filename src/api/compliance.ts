/**
 * Compliance API Routes
 * Endpoints for KYC, AML, and sanction screening
 */

import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import {
  processKYCVerification,
  performSanctionScreening,
  clearAMLFlag,
  blockUserAML,
  getUserComplianceLogs,
  getComplianceSummary,
  runScheduledComplianceChecks,
} from "../engines/compliance.js";

const prisma = new PrismaClient();

export async function complianceRoutes(fastify: FastifyInstance) {
  /**
   * GET /compliance
   * Get overall compliance summary
   */
  fastify.get("/", async () => {
    return getComplianceSummary();
  });

  /**
   * GET /compliance/users/:id
   * Get compliance status for a user
   */
  fastify.get<{ Params: { id: string } }>(
    "/users/:id",
    async (request, reply) => {
      const { id } = request.params;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          kycStatus: true,
          amlStatus: true,
          sanctionStatus: true,
        },
      });

      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }

      const recentLogs = await getUserComplianceLogs(id, { limit: 10 });

      return {
        ...user,
        recentComplianceLogs: recentLogs,
      };
    },
  );

  /**
   * POST /compliance/users/:id/kyc
   * Process KYC verification for a user
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      documentType: "passport" | "drivers_license" | "national_id";
    };
  }>("/users/:id/kyc", async (request, reply) => {
    const { id } = request.params;
    const { documentType } = request.body;

    if (!documentType) {
      return reply.code(400).send({ error: "Document type is required" });
    }

    const validTypes = ["passport", "drivers_license", "national_id"];
    if (!validTypes.includes(documentType)) {
      return reply
        .code(400)
        .send({
          error: `Invalid document type. Valid types: ${validTypes.join(", ")}`,
        });
    }

    const result = await processKYCVerification(id, documentType);

    if (!result.success && result.message === "User not found") {
      return reply.code(404).send({ error: "User not found" });
    }

    return result;
  });

  /**
   * POST /compliance/users/:id/sanction-screen
   * Perform sanction screening for a user
   */
  fastify.post<{
    Params: { id: string };
    Body: { name?: string; country?: string };
  }>("/users/:id/sanction-screen", async (request, reply) => {
    const { id } = request.params;
    const { name, country } = request.body || {};

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    const result = await performSanctionScreening(id, name, country);

    return {
      userId: id,
      ...result,
    };
  });

  /**
   * POST /compliance/users/:id/aml/clear
   * Clear AML flag for a user
   */
  fastify.post<{
    Params: { id: string };
    Body: { reviewerNote: string };
  }>("/users/:id/aml/clear", async (request, reply) => {
    const { id } = request.params;
    const { reviewerNote } = request.body;

    if (!reviewerNote) {
      return reply.code(400).send({ error: "Reviewer note is required" });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    const result = await clearAMLFlag(id, reviewerNote);

    return {
      userId: id,
      ...result,
    };
  });

  /**
   * POST /compliance/users/:id/aml/block
   * Block a user due to AML concerns
   */
  fastify.post<{
    Params: { id: string };
    Body: { reason: string };
  }>("/users/:id/aml/block", async (request, reply) => {
    const { id } = request.params;
    const { reason } = request.body;

    if (!reason) {
      return reply.code(400).send({ error: "Reason is required" });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    const result = await blockUserAML(id, reason);

    return {
      userId: id,
      message: "User blocked and accounts frozen",
      ...result,
    };
  });

  /**
   * GET /compliance/logs
   * Get all compliance logs
   */
  fastify.get<{
    Querystring: {
      type?: string;
      status?: string;
      limit?: string;
    };
  }>("/logs", async (request) => {
    const { type, status, limit } = request.query;

    const where: any = {};

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    const logs = await prisma.complianceLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit ? parseInt(limit) : 50,
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return { logs };
  });

  /**
   * POST /compliance/run-checks
   * Run scheduled compliance checks manually
   */
  fastify.post("/run-checks", async () => {
    const result = await runScheduledComplianceChecks();

    return {
      message: "Compliance checks completed",
      ...result,
    };
  });

  /**
   * GET /compliance/flagged
   * Get all users with compliance issues
   */
  fastify.get("/flagged", async () => {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { kycStatus: { in: ["pending", "rejected", "expired"] } },
          { amlStatus: { in: ["flagged", "blocked"] } },
          { sanctionStatus: { in: ["match", "blocked"] } },
        ],
      },
      select: {
        id: true,
        name: true,
        kycStatus: true,
        amlStatus: true,
        sanctionStatus: true,
      },
    });

    return {
      flaggedCount: users.length,
      users,
    };
  });
}
