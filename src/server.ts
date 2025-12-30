import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();
const fastify = Fastify({
  logger: true,
});
fastify.get('/', async () => {
  return { status: 'this is the app' };
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
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
