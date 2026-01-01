/**
 * Loans API Routes
 * Endpoints for loan management
 */

import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  checkLoanEligibility,
  applyForLoan,
  approveLoan,
  rejectLoan,
  processLoanPayment,
  getUserLoans,
  getLoanSummary,
  type LoanType,
} from '../engines/loans.js';

const prisma = new PrismaClient();

export async function loansRoutes(fastify: FastifyInstance) {
  /**
   * GET /loans
   * Get overall loan summary
   */
  fastify.get('/', async () => {
    return getLoanSummary();
  });

  /**
   * GET /loans/users/:id
   * Get all loans for a user
   */
  fastify.get<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const loans = await getUserLoans(id);
    
    const activeLoans = loans.filter(l => l.status === 'active');
    const totalOwed = activeLoans.reduce((sum, l) => sum + l.remainingAmount, 0);

    return {
      userId: id,
      userName: user.name,
      loanCount: loans.length,
      activeLoans: activeLoans.length,
      totalOwed,
      loans,
    };
  });

  /**
   * GET /loans/users/:id/eligibility
   * Check loan eligibility for a user
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { type?: string; amount?: string };
  }>('/users/:id/eligibility', async (request, reply) => {
    const { id } = request.params;
    const { type = 'consumer', amount } = request.query;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const requestedAmount = amount ? parseInt(amount) : 100000; // Default $1000
    const eligibility = await checkLoanEligibility(id, type as LoanType, requestedAmount);

    return {
      userId: id,
      userName: user.name,
      ...eligibility,
    };
  });

  /**
   * POST /loans/users/:id/apply
   * Apply for a new loan
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      type: string;
      amount: number;
      accountId: string;
      termMonths?: number;
    };
  }>('/users/:id/apply', async (request, reply) => {
    const { id } = request.params;
    const { type, amount, accountId, termMonths = 12 } = request.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // Validate loan type
    const validTypes: LoanType[] = ['student', 'consumer', 'business', 'emergency'];
    if (!validTypes.includes(type as LoanType)) {
      return reply.code(400).send({ error: `Invalid loan type. Valid types: ${validTypes.join(', ')}` });
    }

    if (!amount || amount < 10000) {
      return reply.code(400).send({ error: 'Loan amount must be at least $100 (10000 cents)' });
    }

    if (!accountId) {
      return reply.code(400).send({ error: 'Account ID is required' });
    }

    const result = await applyForLoan(id, accountId, type as LoanType, amount, termMonths);

    if (!result.success) {
      return reply.code(400).send(result);
    }

    return result;
  });

  /**
   * GET /loans/:id
   * Get specific loan details
   */
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const loan = await prisma.loan.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!loan) {
      return reply.code(404).send({ error: 'Loan not found' });
    }

    return loan;
  });

  /**
   * POST /loans/:id/approve
   * Manually approve a pending loan
   */
  fastify.post<{ Params: { id: string } }>('/:id/approve', async (request, reply) => {
    const { id } = request.params;

    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan) {
      return reply.code(404).send({ error: 'Loan not found' });
    }

    if (loan.status !== 'pending') {
      return reply.code(400).send({ error: `Cannot approve loan with status: ${loan.status}` });
    }

    const approved = await approveLoan(id);
    return approved;
  });

  /**
   * POST /loans/:id/reject
   * Reject a pending loan
   */
  fastify.post<{
    Params: { id: string };
    Body: { reason?: string };
  }>('/:id/reject', async (request, reply) => {
    const { id } = request.params;
    const { reason } = request.body || {};

    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan) {
      return reply.code(404).send({ error: 'Loan not found' });
    }

    if (loan.status !== 'pending') {
      return reply.code(400).send({ error: `Cannot reject loan with status: ${loan.status}` });
    }

    const rejected = await rejectLoan(id, reason || 'Manual rejection');
    return rejected;
  });

  /**
   * POST /loans/:id/payment
   * Make a payment on a loan
   */
  fastify.post<{
    Params: { id: string };
    Body: { amount?: number };
  }>('/:id/payment', async (request, reply) => {
    const { id } = request.params;
    const { amount } = request.body || {};

    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan) {
      return reply.code(404).send({ error: 'Loan not found' });
    }

    if (loan.status !== 'active') {
      return reply.code(400).send({ error: `Cannot make payment on loan with status: ${loan.status}` });
    }

    const result = await processLoanPayment(id, amount);
    return result;
  });

  /**
   * GET /loans/pending
   * Get all pending loans (for review)
   */
  fastify.get('/pending', async () => {
    const loans = await prisma.loan.findMany({
      where: { status: 'pending' },
      include: {
        user: { select: { id: true, name: true, riskScore: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { pendingLoans: loans };
  });

  /**
   * GET /loans/defaulted
   * Get all defaulted loans
   */
  fastify.get('/defaulted', async () => {
    const loans = await prisma.loan.findMany({
      where: { status: 'defaulted' },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { defaultedLoans: loans };
  });
}
