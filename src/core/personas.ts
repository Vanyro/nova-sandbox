export type PersonaType = 'student' | 'investor' | 'spender';

export interface CategoryWeight {
  category: string;
  weight: number;
}

export interface IncomePattern {
  type: 'recurring' | 'sporadic' | 'variable';
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'irregular';
  baseAmount: number;
  variance: number; // Percentage variance
}

export interface PersonaConfig {
  name: PersonaType;
  description: string;
  transactionFrequency: {
    min: number; // Min transactions per week
    max: number; // Max transactions per week
  };
  transactionAmount: {
    average: number;
    variance: number; // Percentage variance
  };
  categoryWeights: CategoryWeight[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  allowOverdraft: boolean;
  incomePattern: IncomePattern;
  weekendBehavior: {
    multiplier: number; // How much more/less active on weekends
  };
}

export const PERSONAS: Record<PersonaType, PersonaConfig> = {
  student: {
    name: 'student',
    description: 'College student with allowance and part-time income',
    transactionFrequency: {
      min: 8,
      max: 15,
    },
    transactionAmount: {
      average: 2500, // $25 in cents
      variance: 60,
    },
    categoryWeights: [
      { category: 'food', weight: 30 },
      { category: 'transport', weight: 20 },
      { category: 'entertainment', weight: 15 },
      { category: 'shopping', weight: 15 },
      { category: 'subscriptions', weight: 10 },
      { category: 'education', weight: 10 },
    ],
    riskLevel: 'LOW',
    allowOverdraft: false,
    incomePattern: {
      type: 'recurring',
      frequency: 'monthly',
      baseAmount: 150000, // $1500 scholarship/allowance
      variance: 10,
    },
    weekendBehavior: {
      multiplier: 1.3, // More active on weekends
    },
  },
  investor: {
    name: 'investor',
    description: 'Professional investor with irregular large transactions',
    transactionFrequency: {
      min: 3,
      max: 8,
    },
    transactionAmount: {
      average: 150000, // $1500 in cents
      variance: 80,
    },
    categoryWeights: [
      { category: 'investments', weight: 40 },
      { category: 'food', weight: 15 },
      { category: 'shopping', weight: 15 },
      { category: 'travel', weight: 15 },
      { category: 'utilities', weight: 10 },
      { category: 'healthcare', weight: 5 },
    ],
    riskLevel: 'MEDIUM',
    allowOverdraft: false,
    incomePattern: {
      type: 'sporadic',
      frequency: 'irregular',
      baseAmount: 800000, // $8000 investment returns
      variance: 50,
    },
    weekendBehavior: {
      multiplier: 0.4, // Less active on weekends
    },
  },
  spender: {
    name: 'spender',
    description: 'High-frequency spender with regular income',
    transactionFrequency: {
      min: 20,
      max: 35,
    },
    transactionAmount: {
      average: 4500, // $45 in cents
      variance: 70,
    },
    categoryWeights: [
      { category: 'food', weight: 25 },
      { category: 'shopping', weight: 25 },
      { category: 'entertainment', weight: 20 },
      { category: 'delivery', weight: 15 },
      { category: 'transport', weight: 10 },
      { category: 'subscriptions', weight: 5 },
    ],
    riskLevel: 'HIGH',
    allowOverdraft: true,
    incomePattern: {
      type: 'recurring',
      frequency: 'biweekly',
      baseAmount: 250000, // $2500 salary
      variance: 5,
    },
    weekendBehavior: {
      multiplier: 1.5, // Much more active on weekends
    },
  },
};

export const CATEGORIES = [
  'food',
  'rent',
  'utilities',
  'salary',
  'investments',
  'shopping',
  'transport',
  'entertainment',
  'delivery',
  'subscriptions',
  'education',
  'healthcare',
  'travel',
  'transfer',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];
