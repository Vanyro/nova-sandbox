-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "category" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "description" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "location" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "merchant" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "reference" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "persona" TEXT;

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("balance", "createdAt", "id", "type", "userId") SELECT "balance", "createdAt", "id", "type", "userId" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
