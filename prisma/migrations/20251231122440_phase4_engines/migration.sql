-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "principalAmount" INTEGER NOT NULL,
    "remainingAmount" INTEGER NOT NULL,
    "interestRate" REAL NOT NULL,
    "monthlyPayment" INTEGER NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "nextPaymentDate" DATETIME,
    "paymentsMade" INTEGER NOT NULL DEFAULT 0,
    "paymentsMissed" INTEGER NOT NULL DEFAULT 0,
    "lastPaymentDate" DATETIME,
    "lastPaymentAmount" INTEGER,
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    "defaultedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Loan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Loan_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "principal" INTEGER NOT NULL,
    "interest" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "totalValue" INTEGER NOT NULL DEFAULT 0,
    "totalInvested" INTEGER NOT NULL DEFAULT 0,
    "totalGainLoss" INTEGER NOT NULL DEFAULT 0,
    "riskTolerance" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "avgCostBasis" INTEGER NOT NULL,
    "currentPrice" INTEGER NOT NULL,
    "marketValue" INTEGER NOT NULL,
    "gainLoss" INTEGER NOT NULL,
    "gainLossPercent" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Holding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "previousPrice" INTEGER NOT NULL,
    "change" REAL NOT NULL,
    "volatility" REAL NOT NULL DEFAULT 0.02,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FraudAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "actionTaken" TEXT,
    "resolvedAt" DATETIME,
    "resolvedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FraudAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComplianceLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplianceLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "persona" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "frozenReason" TEXT,
    "frozenAt" DATETIME,
    "overdraftEnabled" BOOLEAN NOT NULL DEFAULT false,
    "overdraftLimit" INTEGER NOT NULL DEFAULT 50000,
    "overdraftUsed" INTEGER NOT NULL DEFAULT 0,
    "dailyLimit" INTEGER NOT NULL DEFAULT 500000,
    "dailySpent" INTEGER NOT NULL DEFAULT 0,
    "dailySpentDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("balance", "createdAt", "dailyLimit", "dailySpent", "dailySpentDate", "frozen", "id", "overdraftEnabled", "persona", "riskLevel", "type", "userId") SELECT "balance", "createdAt", "dailyLimit", "dailySpent", "dailySpentDate", "frozen", "id", "overdraftEnabled", "persona", "riskLevel", "type", "userId" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE TABLE "new_SimulationState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "lastRunAt" DATETIME,
    "currentDay" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionsToday" INTEGER NOT NULL DEFAULT 0,
    "failuresInjected" INTEGER NOT NULL DEFAULT 0,
    "currentMode" TEXT NOT NULL DEFAULT 'normal',
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "marketCrashActive" BOOLEAN NOT NULL DEFAULT false,
    "fraudEventActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SimulationState" ("createdAt", "currentMode", "failuresInjected", "id", "isRunning", "lastRunAt", "transactionsToday", "updatedAt") SELECT "createdAt", "currentMode", "failuresInjected", "id", "isRunning", "lastRunAt", "transactionsToday", "updatedAt" FROM "SimulationState";
DROP TABLE "SimulationState";
ALTER TABLE "new_SimulationState" RENAME TO "SimulationState";
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "authorizedAmount" INTEGER,
    "category" TEXT,
    "merchant" TEXT,
    "location" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "postAt" DATETIME,
    "postedAt" DATETIME,
    "riskFlag" TEXT,
    "fraudFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amount", "authorizedAmount", "category", "createdAt", "description", "id", "location", "merchant", "postAt", "postedAt", "reference", "status", "type") SELECT "accountId", "amount", "authorizedAmount", "category", "createdAt", "description", "id", "location", "merchant", "postAt", "postedAt", "reference", "status", "type" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "persona" TEXT,
    "kycStatus" TEXT NOT NULL DEFAULT 'pending',
    "kycVerifiedAt" DATETIME,
    "amlStatus" TEXT NOT NULL DEFAULT 'clear',
    "sanctionStatus" TEXT NOT NULL DEFAULT 'clear',
    "riskScore" INTEGER NOT NULL DEFAULT 50,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "persona", "role") SELECT "createdAt", "email", "id", "name", "persona", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "MarketAsset_symbol_key" ON "MarketAsset"("symbol");
