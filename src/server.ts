import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

import { accountRoutes } from './api/accounts.js';
import { transactionRoutes } from './api/transactions.js';
import { statsRoutes } from './api/stats.js';
import { adminRoutes } from './api/admin.js';
import { sandboxRoutes } from './api/sandbox.js';
import { riskRoutes } from './api/risk.js';
import { portfolioRoutes } from './api/portfolio.js';
import { loansRoutes } from './api/loans.js';
import { complianceRoutes } from './api/compliance.js';
import { fraudRoutes } from './api/fraud.js';
import { chaosMiddleware } from './middleware/chaos.js';
import { stopSimulation, startSimulation } from './worker/simulationEngine.js';

const prisma = new PrismaClient();
const fastify = Fastify({
  logger: true,
});

// Register Swagger for API documentation
fastify.register(fastifySwagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'Nova Banking Sandbox API',
      description: `
# Nova Banking Sandbox API

A comprehensive banking simulation API for testing and development.

## Features

- **Account Management**: Create, update, and manage bank accounts
- **Transaction Processing**: Full transaction lifecycle (pending → posted/canceled)
- **Fraud Detection**: Real-time fraud analysis with configurable patterns
- **Risk Scoring**: Automatic user risk assessment
- **Loan Management**: Loan applications, payments, and defaults
- **Investment Portfolio**: Market simulation and portfolio tracking
- **Compliance Monitoring**: KYC/AML/Sanctions screening
- **Chaos Engineering**: Test failure modes with configurable chaos

## Authentication

This sandbox API does not require authentication for development purposes.

## Simulation Modes

- \`random\`: Varied transaction patterns
- \`burst\`: High volume bursts
- \`realistic\`: Normal banking patterns

## Chaos Modes

- \`normal\`: No failures injected
- \`latency\`: Add artificial latency
- \`flaky\`: Random failures
- \`maintenance\`: 503 responses
      `,
      version: '4.0.0',
      contact: {
        name: 'Nova Fintech',
        email: 'support@novafintech.com',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Local Development Server',
      },
      {
        url: 'http://sandbox.novafintech.com',
        description: 'Production Sandbox',
      },
    ],
    tags: [
      { name: 'Accounts', description: 'Bank account operations' },
      { name: 'Transactions', description: 'Transaction operations' },
      { name: 'Statistics', description: 'Analytics and reporting' },
      { name: 'Sandbox', description: 'Sandbox control and simulation' },
      { name: 'Risk', description: 'Risk scoring and events' },
      { name: 'Fraud', description: 'Fraud detection and alerts' },
      { name: 'Loans', description: 'Loan management' },
      { name: 'Portfolio', description: 'Investment portfolio management' },
      { name: 'Compliance', description: 'KYC/AML/Sanctions compliance' },
    ],
    components: {
      schemas: {
        Account: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            accountNumber: { type: 'string' },
            type: { type: 'string', enum: ['checking', 'savings', 'investment'] },
            balance: { type: 'integer', description: 'Balance in cents' },
            currency: { type: 'string', default: 'USD' },
            status: { type: 'string', enum: ['active', 'frozen', 'closed'] },
            overdraftEnabled: { type: 'boolean' },
            dailyLimit: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            accountId: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['credit', 'debit'] },
            amount: { type: 'integer', description: 'Amount in cents' },
            description: { type: 'string' },
            category: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'posted', 'canceled'] },
            merchantId: { type: 'string' },
            merchantName: { type: 'string' },
            location: { type: 'string' },
            metadata: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            postedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        FraudAlert: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            transactionId: { type: 'string', format: 'uuid', nullable: true },
            type: { type: 'string', enum: ['velocity', 'amount_anomaly', 'geolocation_mismatch', 'duplicate_transaction', 'account_takeover', 'suspicious_activity'] },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            status: { type: 'string', enum: ['open', 'investigating', 'resolved', 'false_positive'] },
            description: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        RiskEvent: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            type: { type: 'string' },
            level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            description: { type: 'string' },
            resolved: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Loan: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            accountId: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: ['personal', 'mortgage', 'auto', 'business', 'student'] },
            principalAmount: { type: 'integer' },
            interestRate: { type: 'number' },
            termMonths: { type: 'integer' },
            monthlyPayment: { type: 'integer' },
            remainingBalance: { type: 'integer' },
            status: { type: 'string', enum: ['pending', 'approved', 'active', 'paid_off', 'defaulted'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            statusCode: { type: 'integer' },
          },
        },
      },
    },
  },
});

// Register Swagger UI
fastify.register(fastifySwaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
    displayRequestDuration: true,
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
});

// Register chaos middleware (applies to all routes)
fastify.register(chaosMiddleware);

// Register routes
fastify.register(accountRoutes);
fastify.register(transactionRoutes);
fastify.register(statsRoutes);
fastify.register(adminRoutes);
fastify.register(sandboxRoutes);

// Phase 4 Engine Routes
fastify.register(riskRoutes, { prefix: '/risk' });
fastify.register(portfolioRoutes, { prefix: '/portfolio' });
fastify.register(loansRoutes, { prefix: '/loans' });
fastify.register(complianceRoutes, { prefix: '/compliance' });
fastify.register(fraudRoutes, { prefix: '/fraud' });

fastify.get('/', async () => {
  return { status: 'Nova Sandbox Banking API v4.0 - Full Banking Simulation' };
});
// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok' };
});

// Error handler
fastify.setErrorHandler((error, _request, reply) => {
  fastify.log.error(error);
  reply.status(500).send({ error: 'Internal Server Error' });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  fastify.log.info('Starting graceful shutdown...');
  stopSimulation();
  await prisma.$disconnect();
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4000', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    fastify.log.info(`Server listening on http://${host}:${port}`);
    
    // Auto-start simulation if enabled
    if (process.env.AUTO_START_SIMULATION === 'true') {
      fastify.log.info('Auto-starting simulation engine...');
      await startSimulation();
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
