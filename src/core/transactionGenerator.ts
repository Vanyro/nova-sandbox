import type { PersonaConfig, Category } from "./personas.js";
import { SeededRandom } from "./random.js";
import {
  getMerchantForCategory,
  getRandomCity,
  generateTransactionReference,
  generateDescription,
} from "./merchants.js";

export interface GeneratedTransaction {
  type: "credit" | "debit";
  amount: number;
  category: Category;
  merchant: string;
  location: string;
  reference: string;
  description: string;
  createdAt: Date;
}

export class TransactionGenerator {
  private rng: SeededRandom;

  constructor(seed: string | number) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Check if a date is a weekend
   */
  private isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  /**
   * Check if a date is a payday (15th and last day of month for biweekly, last day for monthly)
   */
  private isPayday(date: Date, frequency: string): boolean {
    const dayOfMonth = date.getDate();
    const lastDayOfMonth = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
    ).getDate();

    if (frequency === "monthly") {
      return dayOfMonth === lastDayOfMonth;
    } else if (frequency === "biweekly") {
      return dayOfMonth === 15 || dayOfMonth === lastDayOfMonth;
    } else if (frequency === "weekly") {
      return date.getDay() === 5; // Friday
    }
    return false;
  }

  /**
   * Generate income transaction for a specific date
   */
  generateIncome(
    persona: PersonaConfig,
    date: Date,
  ): GeneratedTransaction | null {
    const { incomePattern } = persona;

    // Check if this is an income day
    let shouldGenerate = false;

    if (incomePattern.type === "recurring") {
      shouldGenerate = this.isPayday(date, incomePattern.frequency);
    } else if (incomePattern.type === "sporadic") {
      // Sporadic income: 10-20% chance on non-weekend days
      const chance = this.isWeekend(date) ? 0.05 : 0.15;
      shouldGenerate = this.rng.nextBoolean(chance);
    }

    if (!shouldGenerate) return null;

    const category: Category = "salary";
    const amount = this.rng.nextWithVariance(
      incomePattern.baseAmount,
      incomePattern.variance,
    );
    const merchant = getMerchantForCategory(category, () => this.rng.next());

    return {
      type: "credit",
      amount,
      category,
      merchant,
      location: getRandomCity(() => this.rng.next()),
      reference: generateTransactionReference(() => this.rng.next()),
      description: generateDescription("credit", category, merchant),
      createdAt: date,
    };
  }

  /**
   * Generate expense transactions for a specific date
   */
  generateExpenses(
    persona: PersonaConfig,
    date: Date,
    currentBalance: number,
  ): GeneratedTransaction[] {
    const transactions: GeneratedTransaction[] = [];

    // Adjust transaction frequency based on weekend behavior
    const weekendMultiplier = this.isWeekend(date)
      ? persona.weekendBehavior.multiplier
      : 1.0;

    // Calculate number of transactions for this day
    const weeklyFreq =
      (persona.transactionFrequency.min + persona.transactionFrequency.max) / 2;
    const dailyFreq = (weeklyFreq / 7) * weekendMultiplier;

    // Use Poisson-like distribution
    const numTransactions = Math.max(
      0,
      Math.round(dailyFreq + (this.rng.next() - 0.5) * 2),
    );

    for (let i = 0; i < numTransactions; i++) {
      // Select category based on weights
      const category = this.rng.pickWeighted(persona.categoryWeights)
        .category as Category;

      // Generate amount
      let amount = this.rng.nextWithVariance(
        persona.transactionAmount.average,
        persona.transactionAmount.variance,
      );

      // Ensure minimum amount
      amount = Math.max(100, amount); // At least $1

      // Check balance constraints
      if (!persona.allowOverdraft && currentBalance - amount < 0) {
        // Skip this transaction if it would overdraft
        continue;
      }

      const merchant = getMerchantForCategory(category, () => this.rng.next());

      // Add some time variation within the day
      const hours = this.rng.nextInt(6, 23); // 6am to 11pm
      const minutes = this.rng.nextInt(0, 59);
      const transactionDate = new Date(date);
      transactionDate.setHours(hours, minutes, 0, 0);

      transactions.push({
        type: "debit",
        amount,
        category,
        merchant,
        location: getRandomCity(() => this.rng.next()),
        reference: generateTransactionReference(() => this.rng.next()),
        description: generateDescription("debit", category, merchant),
        createdAt: transactionDate,
      });

      // Update current balance for next iteration
      currentBalance -= amount;
    }

    return transactions;
  }

  /**
   * Generate all transactions for a time period
   */
  generateTransactionsForPeriod(
    persona: PersonaConfig,
    startDate: Date,
    endDate: Date,
    initialBalance: number = 0,
  ): GeneratedTransaction[] {
    const allTransactions: GeneratedTransaction[] = [];
    let currentBalance = initialBalance;

    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      // Generate income first
      const income = this.generateIncome(persona, new Date(currentDate));
      if (income) {
        allTransactions.push(income);
        currentBalance += income.amount;
      }

      // Generate expenses
      const expenses = this.generateExpenses(
        persona,
        new Date(currentDate),
        currentBalance,
      );
      allTransactions.push(...expenses);

      // Update balance
      expenses.forEach((expense) => {
        currentBalance -= expense.amount;
      });

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return allTransactions;
  }
}
