import { PrismaClient } from '@prisma/client';
import { parseSeedConfig, SEED_MODE_CONFIGS } from '../core/config.js';
import { PERSONAS } from '../core/personas.js';
import { TransactionGenerator } from '../core/transactionGenerator.js';
import { createLogger } from '../core/logger.js';
import { SeededRandom } from '../core/random.js';

const prisma = new PrismaClient();
const logger = createLogger('SeedEngine');

const FIRST_NAMES = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emma', 'Chris', 'Lisa', 'Robert', 'Anna', 'James', 'Mary', 'William', 'Patricia', 'Richard', 'Linda', 'Charles', 'Barbara', 'Joseph', 'Elizabeth'];
const LAST_NAMES = ['Doe', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson'];

export async function checkExistingData(): Promise<boolean> {
  const userCount = await prisma.user.count();
  const accountCount = await prisma.account.count();
  const transactionCount = await prisma.transaction.count();

  if (userCount > 0 || accountCount > 0 || transactionCount > 0) {
    logger.warn('Existing data detected in database', {
      users: userCount,
      accounts: accountCount,
      transactions: transactionCount,
    });
    return true;
  }

  return false;
}

export async function resetDatabase() {
  logger.subsection('Resetting database');

  try {
    // Delete in order due to foreign key constraints
    await prisma.transaction.deleteMany();
    logger.info('Deleted all transactions');

    await prisma.account.deleteMany();
    logger.info('Deleted all accounts');

    await prisma.user.deleteMany();
    logger.info('Deleted all users');

    logger.success('Database reset complete');
  } catch (error) {
    logger.error('Failed to reset database', error);
    throw error;
  }
}

export async function seedDatabase() {
  logger.section('🌱 Starting Seed Process');

  // Parse configuration
  const config = parseSeedConfig();
  const modeConfig = SEED_MODE_CONFIGS[config.mode];

  logger.info('Seed Configuration', {
    seedKey: config.seedKey,
    months: config.months,
    personas: config.personas,
    mode: config.mode,
    usersPerPersona: config.usersPerPersona,
    transactionMultiplier: modeConfig.transactionMultiplier,
  });

  // Check for existing data
  const hasData = await checkExistingData();
  if (hasData) {
    logger.warn(
      '⚠️  Database contains existing data. Run with --reset flag to clear.'
    );
    logger.warn('Aborting seed process to prevent duplicates.');
    return;
  }

  // Initialize seeded random for consistent data generation
  const masterRng = new SeededRandom(config.seedKey);

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - config.months);

  logger.info('Time Range', {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    days: Math.floor(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ),
  });

  logger.section('👥 Creating Users and Accounts');

  let totalUsers = 0;
  let totalAccounts = 0;
  let totalTransactions = 0;

  // Create users for each persona
  for (const personaType of config.personas) {
    logger.subsection(`Persona: ${personaType}`);

    const persona = PERSONAS[personaType];
    const usersToCreate = config.usersPerPersona;

    for (let i = 0; i < usersToCreate; i++) {
      // Generate deterministic user data
      const userId = masterRng.nextInt(1000, 9999);
      const firstNameIndex = masterRng.nextInt(0, FIRST_NAMES.length - 1);
      const lastNameIndex = masterRng.nextInt(0, LAST_NAMES.length - 1);
      const firstName = FIRST_NAMES[firstNameIndex];
      const lastName = LAST_NAMES[lastNameIndex];
      const userName = `${firstName} ${lastName}`;
      const userEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${userId}@example.com`;

      // Create user
      const user = await prisma.user.create({
        data: {
          name: userName,
          email: userEmail,
          role: 'USER',
          persona: personaType,
        },
      });

      totalUsers++;

      // Create 1-2 accounts per user
      const numAccounts = masterRng.nextBoolean(0.7) ? 1 : 2;

      for (let j = 0; j < numAccounts; j++) {
        const accountType = j === 0 ? 'CHECKING' : 'SAVINGS';

        // Create account with overdraft enabled for spenders
        const account = await prisma.account.create({
          data: {
            userId: user.id,
            type: accountType,
            balance: 0, // Will be updated as we add transactions
            persona: personaType,
            riskLevel: persona.riskLevel,
            overdraftEnabled: persona.allowOverdraft,
            dailyLimit: personaType === 'investor' ? 2000000 : 500000, // Higher limit for investors
          },
        });

        totalAccounts++;

        logger.info(
          `Created ${accountType} account for ${userName} (${i + 1}/${usersToCreate})`
        );

        // Generate transactions for this account
        logger.info(`Generating transactions for ${account.id}...`);

        // Create a seeded generator for this specific account
        const accountSeed = `${config.seedKey}-${account.id}`;
        const transactionGen = new TransactionGenerator(accountSeed);

        // Generate transactions
        const transactions = transactionGen.generateTransactionsForPeriod(
          persona,
          startDate,
          endDate,
          0
        );

        logger.info(
          `Generated ${transactions.length} transactions for account`
        );

        // Insert transactions in batches and update balance
        // Historical transactions are marked as 'posted'
        let runningBalance = 0;
        const batchSize = 100;

        for (let k = 0; k < transactions.length; k += batchSize) {
          const batch = transactions.slice(k, k + batchSize);

          await prisma.transaction.createMany({
            data: batch.map((txn) => {
              // Update running balance
              if (txn.type === 'credit') {
                runningBalance += txn.amount;
              } else {
                runningBalance -= txn.amount;
              }

              return {
                accountId: account.id,
                type: txn.type,
                amount: txn.amount,
                authorizedAmount: txn.amount,
                category: txn.category,
                merchant: txn.merchant,
                location: txn.location,
                reference: txn.reference,
                description: txn.description,
                status: 'posted', // Historical transactions are already posted
                postedAt: txn.createdAt,
                createdAt: txn.createdAt,
              };
            }),
          });

          totalTransactions += batch.length;

          if (k % 500 === 0 && k > 0) {
            logger.progress(k, transactions.length, 'Transactions inserted');
          }
        }

        // Update final account balance
        await prisma.account.update({
          where: { id: account.id },
          data: { balance: runningBalance },
        });

        // Check for anomalies
        if (runningBalance < -100000 && !persona.allowOverdraft) {
          logger.anomaly(
            `Account ${account.id} has large negative balance but persona doesn't allow overdraft`,
            { balance: runningBalance, persona: personaType }
          );
        }

        logger.info(`Final balance: $${(runningBalance / 100).toFixed(2)}`);
      }
    }
  }

  logger.section('✅ Seed Process Complete');
  logger.success('Summary', {
    users: totalUsers,
    accounts: totalAccounts,
    transactions: totalTransactions,
    averageTransactionsPerAccount: Math.round(
      totalTransactions / totalAccounts
    ),
  });
}

async function main() {
  try {
    // Check if --reset flag is present
    const shouldReset = process.argv.includes('--reset');

    if (shouldReset) {
      await resetDatabase();
    }

    await seedDatabase();
  } catch (error) {
    logger.error('Seed process failed', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as runSeed };
