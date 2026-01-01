/**
 * Investment Engine
 * Simulates portfolios for personas including stocks, crypto, ETFs, and savings
 * Handles market events like volatility and crashes
 */

import { PrismaClient } from "@prisma/client";
import { createLogger } from "../core/logger.js";
import { SeededRandom } from "../core/random.js";

const prisma = new PrismaClient();
const logger = createLogger("InvestmentEngine");

export type AssetType = "stock" | "crypto" | "etf" | "bond" | "savings";
export type PortfolioType =
  | "conservative"
  | "balanced"
  | "aggressive"
  | "crypto";

// Default market assets for simulation
const DEFAULT_ASSETS = [
  // Stocks
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    type: "stock",
    price: 18500,
    volatility: 0.02,
  },
  {
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    type: "stock",
    price: 14200,
    volatility: 0.025,
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    type: "stock",
    price: 37500,
    volatility: 0.018,
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    type: "stock",
    price: 17800,
    volatility: 0.028,
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    type: "stock",
    price: 24200,
    volatility: 0.045,
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    type: "stock",
    price: 48000,
    volatility: 0.04,
  },

  // ETFs
  {
    symbol: "SPY",
    name: "S&P 500 ETF",
    type: "etf",
    price: 47500,
    volatility: 0.012,
  },
  {
    symbol: "QQQ",
    name: "Nasdaq-100 ETF",
    type: "etf",
    price: 40000,
    volatility: 0.018,
  },
  {
    symbol: "VTI",
    name: "Total Stock Market ETF",
    type: "etf",
    price: 24000,
    volatility: 0.011,
  },
  {
    symbol: "BND",
    name: "Total Bond Market ETF",
    type: "etf",
    price: 7200,
    volatility: 0.005,
  },

  // Crypto
  {
    symbol: "BTC",
    name: "Bitcoin",
    type: "crypto",
    price: 4250000,
    volatility: 0.06,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    type: "crypto",
    price: 230000,
    volatility: 0.07,
  },
  {
    symbol: "SOL",
    name: "Solana",
    type: "crypto",
    price: 15000,
    volatility: 0.08,
  },
  {
    symbol: "DOGE",
    name: "Dogecoin",
    type: "crypto",
    price: 15,
    volatility: 0.12,
  },

  // Bonds/Savings
  {
    symbol: "TBILL",
    name: "Treasury Bills",
    type: "bond",
    price: 10000,
    volatility: 0.001,
  },
  {
    symbol: "HYS",
    name: "High Yield Savings",
    type: "savings",
    price: 10000,
    volatility: 0.0001,
  },
];

// Portfolio allocations by type
const PORTFOLIO_ALLOCATIONS: Record<
  PortfolioType,
  Array<{ symbol: string; weight: number }>
> = {
  conservative: [
    { symbol: "BND", weight: 0.4 },
    { symbol: "SPY", weight: 0.3 },
    { symbol: "VTI", weight: 0.2 },
    { symbol: "HYS", weight: 0.1 },
  ],
  balanced: [
    { symbol: "SPY", weight: 0.35 },
    { symbol: "QQQ", weight: 0.2 },
    { symbol: "VTI", weight: 0.15 },
    { symbol: "BND", weight: 0.15 },
    { symbol: "AAPL", weight: 0.1 },
    { symbol: "MSFT", weight: 0.05 },
  ],
  aggressive: [
    { symbol: "QQQ", weight: 0.25 },
    { symbol: "TSLA", weight: 0.15 },
    { symbol: "NVDA", weight: 0.15 },
    { symbol: "AMZN", weight: 0.15 },
    { symbol: "GOOGL", weight: 0.15 },
    { symbol: "BTC", weight: 0.1 },
    { symbol: "ETH", weight: 0.05 },
  ],
  crypto: [
    { symbol: "BTC", weight: 0.5 },
    { symbol: "ETH", weight: 0.3 },
    { symbol: "SOL", weight: 0.15 },
    { symbol: "DOGE", weight: 0.05 },
  ],
};

/**
 * Initialize market assets if not present
 */
export async function initializeMarketAssets(): Promise<void> {
  const existingCount = await prisma.marketAsset.count();
  if (existingCount > 0) return;

  for (const asset of DEFAULT_ASSETS) {
    await prisma.marketAsset.create({
      data: {
        symbol: asset.symbol,
        name: asset.name,
        type: asset.type,
        price: asset.price,
        previousPrice: asset.price,
        change: 0,
        volatility: asset.volatility,
      },
    });
  }

  logger.info(`Initialized ${DEFAULT_ASSETS.length} market assets`);
}

/**
 * Create a portfolio for a user
 */
export async function createPortfolio(
  userId: string,
  portfolioType: PortfolioType,
  initialInvestment: number,
  name?: string,
): Promise<any> {
  await initializeMarketAssets();

  const allocation = PORTFOLIO_ALLOCATIONS[portfolioType];
  const assets = await prisma.marketAsset.findMany({
    where: { symbol: { in: allocation.map((a) => a.symbol) } },
  });

  const portfolio = await prisma.portfolio.create({
    data: {
      userId,
      name:
        name ||
        `${portfolioType.charAt(0).toUpperCase() + portfolioType.slice(1)} Portfolio`,
      type: portfolioType,
      totalInvested: initialInvestment,
      riskTolerance:
        portfolioType === "crypto" || portfolioType === "aggressive"
          ? "high"
          : portfolioType === "conservative"
            ? "low"
            : "medium",
    },
  });

  // Create holdings based on allocation
  let totalValue = 0;
  for (const alloc of allocation) {
    const asset = assets.find((a) => a.symbol === alloc.symbol);
    if (!asset) continue;

    const investmentAmount = Math.floor(initialInvestment * alloc.weight);
    const quantity = investmentAmount / asset.price;
    const marketValue = Math.floor(quantity * asset.price);

    await prisma.holding.create({
      data: {
        portfolioId: portfolio.id,
        symbol: asset.symbol,
        name: asset.name,
        type: asset.type,
        quantity,
        avgCostBasis: asset.price,
        currentPrice: asset.price,
        marketValue,
        gainLoss: 0,
        gainLossPercent: 0,
      },
    });

    totalValue += marketValue;
  }

  // Update portfolio total
  await prisma.portfolio.update({
    where: { id: portfolio.id },
    data: { totalValue },
  });

  logger.info(`Created ${portfolioType} portfolio for user ${userId}`, {
    portfolioId: portfolio.id,
    holdings: allocation.length,
    totalValue: `$${(totalValue / 100).toFixed(2)}`,
  });

  return prisma.portfolio.findUnique({
    where: { id: portfolio.id },
    include: { holdings: true },
  });
}

/**
 * Update market prices (daily simulation)
 */
export async function updateMarketPrices(
  seed?: number,
  volatilityMultiplier: number = 1.0,
): Promise<{ updated: number; avgChange: number }> {
  const rng = new SeededRandom(seed || Date.now());
  const assets = await prisma.marketAsset.findMany();

  let totalChange = 0;

  for (const asset of assets) {
    // Calculate daily change based on volatility
    const baseChange =
      (rng.next() * 2 - 1) * asset.volatility * volatilityMultiplier;

    // Add momentum factor (slight trend continuation)
    const momentum = asset.change * 0.1;
    const dailyChange = baseChange + momentum;

    // Calculate new price
    const newPrice = Math.max(1, Math.floor(asset.price * (1 + dailyChange)));

    await prisma.marketAsset.update({
      where: { id: asset.id },
      data: {
        previousPrice: asset.price,
        price: newPrice,
        change: dailyChange,
      },
    });

    totalChange += Math.abs(dailyChange);
  }

  const avgChange = assets.length > 0 ? totalChange / assets.length : 0;

  logger.info(`Updated ${assets.length} market prices`, {
    avgChange: `${(avgChange * 100).toFixed(2)}%`,
  });

  return { updated: assets.length, avgChange };
}

/**
 * Update all portfolio valuations
 */
export async function updatePortfolioValuations(): Promise<number> {
  const portfolios = await prisma.portfolio.findMany({
    include: { holdings: true },
  });

  const assets = await prisma.marketAsset.findMany();
  const priceMap = new Map(assets.map((a) => [a.symbol, a.price]));

  let updated = 0;

  for (const portfolio of portfolios) {
    let totalValue = 0;
    let totalGainLoss = 0;

    for (const holding of portfolio.holdings) {
      const currentPrice = priceMap.get(holding.symbol) || holding.currentPrice;
      const marketValue = Math.floor(holding.quantity * currentPrice);
      const costBasis = Math.floor(holding.quantity * holding.avgCostBasis);
      const gainLoss = marketValue - costBasis;
      const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

      await prisma.holding.update({
        where: { id: holding.id },
        data: {
          currentPrice,
          marketValue,
          gainLoss,
          gainLossPercent,
        },
      });

      totalValue += marketValue;
      totalGainLoss += gainLoss;
    }

    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: {
        totalValue,
        totalGainLoss,
      },
    });

    updated++;
  }

  logger.info(`Updated ${updated} portfolio valuations`);

  return updated;
}

/**
 * Trigger a market crash simulation
 */
export async function triggerMarketCrash(
  severity: "mild" | "moderate" | "severe" = "moderate",
): Promise<{
  assetsAffected: number;
  avgDrop: number;
  portfoliosAffected: number;
}> {
  logger.section("Triggering Market Crash Simulation");

  const crashMultipliers: Record<string, number> = {
    mild: 0.05, // 5% drop
    moderate: 0.15, // 15% drop
    severe: 0.35, // 35% drop
  };

  const crashAmount = crashMultipliers[severity] ?? 0.15;
  const assets = await prisma.marketAsset.findMany();

  let totalDrop = 0;

  for (const asset of assets) {
    // Crypto and high-volatility assets drop more
    let assetCrashAmount = crashAmount;
    if (asset.type === "crypto") {
      assetCrashAmount = assetCrashAmount * 1.5;
    } else if (asset.type === "bond" || asset.type === "savings") {
      assetCrashAmount = assetCrashAmount * 0.3; // Safe assets drop less
    }

    // Add some randomness
    const finalCrashAmount = assetCrashAmount * (0.8 + Math.random() * 0.4);

    const newPrice = Math.max(
      1,
      Math.floor(asset.price * (1 - finalCrashAmount)),
    );
    const change = (newPrice - asset.price) / asset.price;

    await prisma.marketAsset.update({
      where: { id: asset.id },
      data: {
        previousPrice: asset.price,
        price: newPrice,
        change,
      },
    });

    totalDrop += Math.abs(change);
  }

  // Update portfolio valuations
  const portfoliosAffected = await updatePortfolioValuations();

  // Update simulation state
  await prisma.simulationState.update({
    where: { id: "singleton" },
    data: { marketCrashActive: true },
  });

  const avgDrop = assets.length > 0 ? totalDrop / assets.length : 0;

  logger.warn(`Market crash triggered: ${severity}`, {
    assetsAffected: assets.length,
    avgDrop: `${(avgDrop * 100).toFixed(2)}%`,
  });

  return {
    assetsAffected: assets.length,
    avgDrop,
    portfoliosAffected,
  };
}

/**
 * Trigger market recovery
 */
export async function triggerMarketRecovery(
  recoveryPercent: number = 0.1,
): Promise<{ assetsAffected: number; avgGain: number }> {
  const assets = await prisma.marketAsset.findMany();
  let totalGain = 0;

  for (const asset of assets) {
    const recovery = recoveryPercent * (0.8 + Math.random() * 0.4);
    const newPrice = Math.floor(asset.price * (1 + recovery));

    await prisma.marketAsset.update({
      where: { id: asset.id },
      data: {
        previousPrice: asset.price,
        price: newPrice,
        change: recovery,
      },
    });

    totalGain += recovery;
  }

  await updatePortfolioValuations();

  await prisma.simulationState.update({
    where: { id: "singleton" },
    data: { marketCrashActive: false },
  });

  const avgGain = assets.length > 0 ? totalGain / assets.length : 0;

  logger.info(`Market recovery triggered`, {
    avgGain: `${(avgGain * 100).toFixed(2)}%`,
  });

  return { assetsAffected: assets.length, avgGain };
}

/**
 * Get user's portfolios
 */
export async function getUserPortfolios(userId: string): Promise<any[]> {
  return prisma.portfolio.findMany({
    where: { userId },
    include: {
      holdings: {
        orderBy: { marketValue: "desc" },
      },
    },
  });
}

/**
 * Get market overview
 */
export async function getMarketOverview(): Promise<{
  assets: any[];
  marketStatus: "bull" | "bear" | "neutral";
  totalMarketCap: number;
  avgDailyChange: number;
  topGainers: any[];
  topLosers: any[];
}> {
  const assets = await prisma.marketAsset.findMany({
    orderBy: { price: "desc" },
  });

  const avgChange =
    assets.reduce((sum, a) => sum + a.change, 0) / assets.length;
  const marketStatus =
    avgChange > 0.01 ? "bull" : avgChange < -0.01 ? "bear" : "neutral";

  const sortedByChange = [...assets].sort((a, b) => b.change - a.change);

  return {
    assets,
    marketStatus,
    totalMarketCap: assets.reduce((sum, a) => sum + a.price * 1000000, 0), // Simulated market cap
    avgDailyChange: avgChange,
    topGainers: sortedByChange.slice(0, 3),
    topLosers: sortedByChange.slice(-3).reverse(),
  };
}

/**
 * Get investment summary statistics
 */
export async function getInvestmentSummary(): Promise<{
  totalPortfolios: number;
  totalInvested: number;
  totalValue: number;
  totalGainLoss: number;
  avgReturn: number;
  byType: Record<PortfolioType, { count: number; value: number }>;
}> {
  const portfolios = await prisma.portfolio.findMany();

  const byType: Record<string, { count: number; value: number }> = {};
  let totalInvested = 0;
  let totalValue = 0;
  let totalGainLoss = 0;

  portfolios.forEach((p) => {
    const pType = p.type as string;
    if (!byType[pType]) {
      byType[pType] = { count: 0, value: 0 };
    }
    byType[pType]!.count++;
    byType[pType]!.value += p.totalValue;

    totalInvested += p.totalInvested;
    totalValue += p.totalValue;
    totalGainLoss += p.totalGainLoss;
  });

  const avgReturn =
    totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  return {
    totalPortfolios: portfolios.length,
    totalInvested,
    totalValue,
    totalGainLoss,
    avgReturn,
    byType: byType as Record<PortfolioType, { count: number; value: number }>,
  };
}

/**
 * Update all portfolio values based on current market prices (automatic task)
 */
export async function updateAllPortfolioValues(): Promise<{
  updated: number;
  totalValueChange: number;
}> {
  const portfolios = await prisma.portfolio.findMany({
    include: { holdings: true },
  });

  // Pre-fetch all market assets for efficiency
  const assets = await prisma.marketAsset.findMany();
  const priceMap = new Map(assets.map((a) => [a.symbol, a.price]));

  let updated = 0;
  let totalValueChange = 0;

  for (const portfolio of portfolios) {
    const oldValue = portfolio.totalValue;

    // Calculate new value based on current holdings
    let newValue = 0;
    for (const holding of portfolio.holdings) {
      const currentPrice = priceMap.get(holding.symbol) ?? holding.currentPrice;
      newValue += Math.floor(holding.quantity * currentPrice);

      // Also update each holding's market value
      const marketValue = Math.floor(holding.quantity * currentPrice);
      const costBasis = Math.floor(holding.quantity * holding.avgCostBasis);
      await prisma.holding.update({
        where: { id: holding.id },
        data: {
          currentPrice,
          marketValue,
          gainLoss: marketValue - costBasis,
          gainLossPercent:
            costBasis > 0 ? ((marketValue - costBasis) / costBasis) * 100 : 0,
        },
      });
    }

    const gainLoss = newValue - portfolio.totalInvested;

    await prisma.portfolio.update({
      where: { id: portfolio.id },
      data: {
        totalValue: newValue,
        totalGainLoss: gainLoss,
      },
    });

    updated++;
    totalValueChange += newValue - oldValue;
  }

  return { updated, totalValueChange };
}
