-- CreateTable
CREATE TABLE "SimulationState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "lastRunAt" DATETIME,
    "transactionsToday" INTEGER NOT NULL DEFAULT 0,
    "failuresInjected" INTEGER NOT NULL DEFAULT 0,
    "currentMode" TEXT NOT NULL DEFAULT 'normal',
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
    "overdraftEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyLimit" INTEGER NOT NULL DEFAULT 500000,
    "dailySpent" INTEGER NOT NULL DEFAULT 0,
    "dailySpentDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("balance", "createdAt", "id", "persona", "riskLevel", "type", "userId") SELECT "balance", "createdAt", "id", "persona", "riskLevel", "type", "userId" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amount", "category", "createdAt", "description", "id", "location", "merchant", "reference", "type") SELECT "accountId", "amount", "category", "createdAt", "description", "id", "location", "merchant", "reference", "type" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
