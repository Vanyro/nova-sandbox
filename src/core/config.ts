import type { PersonaType } from './personas.js';

export type SeedMode = 'light' | 'realistic' | 'stress';

export interface SeedConfig {
  seedKey: string;
  months: number;
  personas: PersonaType[];
  mode: SeedMode;
  usersPerPersona: number;
}

export const SEED_MODE_CONFIGS: Record<
  SeedMode,
  { usersPerPersona: number; transactionMultiplier: number }
> = {
  light: {
    usersPerPersona: 1,
    transactionMultiplier: 0.5,
  },
  realistic: {
    usersPerPersona: 3,
    transactionMultiplier: 1.0,
  },
  stress: {
    usersPerPersona: 10,
    transactionMultiplier: 2.0,
  },
};

export function parseSeedConfig(): SeedConfig {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const config: Partial<SeedConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg.startsWith('--months=')) {
      const value = arg.split('=')[1];
      if (value) config.months = parseInt(value, 10);
    } else if (arg.startsWith('--personas=')) {
      const personasStr = arg.split('=')[1];
      if (personasStr) config.personas = personasStr.split(',') as PersonaType[];
    } else if (arg.startsWith('--seedKey=')) {
      const value = arg.split('=')[1];
      if (value) config.seedKey = value;
    } else if (arg.startsWith('--mode=')) {
      const value = arg.split('=')[1];
      if (value) config.mode = value as SeedMode;
    }
  }

  // Fallback to environment variables or defaults
  const mode = (config.mode ||
    process.env.SEED_MODE ||
    'realistic') as SeedMode;

  const defaultConfig = SEED_MODE_CONFIGS[mode];

  return {
    seedKey: config.seedKey || process.env.SEED_KEY || 'default-seed-2024',
    months: config.months || parseInt(process.env.SEED_MONTHS || '12', 10),
    personas:
      config.personas ||
      (process.env.SEED_PERSONAS?.split(',') as PersonaType[]) || [
        'student',
        'investor',
        'spender',
      ],
    mode,
    usersPerPersona: defaultConfig.usersPerPersona,
  };
}
