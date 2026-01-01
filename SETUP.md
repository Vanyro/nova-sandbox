# Nova Banking Sandbox - Setup Guide

A comprehensive banking simulation API for testing and development.

## Table of Contents

- [Quick Start](#quick-start)
- [Local Development](#local-development)
- [Docker Setup](#docker-setup)
- [Connecting Nova App](#connecting-nova-app)
- [API Documentation](#api-documentation)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- Docker (optional, recommended)

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/novafintech/nova_sandbox.git
cd nova_sandbox

# Start with Docker Compose
docker-compose up -d

# The API will be available at http://localhost:4000
# Swagger docs at http://localhost:4000/docs
```

### Option 2: Local Node.js

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Seed the database
npm run seed

# Start development server
npm run dev
```

---

## Local Development

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=4000
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_URL="file:./prisma/db/sandbox.db"

# Simulation Settings
AUTO_START_SIMULATION=false
SIMULATION_MODE=random
SIMULATION_INTERVAL=30000

# Feature Flags
ENABLE_SWAGGER=true
LOG_LEVEL=debug
```

### Available Scripts

```bash
# Development (with hot reload)
npm run dev

# Production build
npm run build
npm start

# Database management
npm run prisma:migrate    # Run migrations
npm run prisma:generate   # Generate client
npm run prisma:studio     # Open Prisma Studio

# Seeding
npm run seed              # Normal seed
npm run seed:reset        # Reset and re-seed
npm run seed:light        # Minimal data
npm run seed:stress       # Large dataset

# Testing
npm test                  # Run all tests
npm run test:phase3       # Run Phase 3 tests only
```

### Project Structure

```
nova_sandbox/
├── src/
│   ├── api/              # Route handlers
│   │   ├── accounts.ts
│   │   ├── transactions.ts
│   │   ├── sandbox.ts
│   │   ├── fraud.ts
│   │   ├── risk.ts
│   │   ├── loans.ts
│   │   ├── portfolio.ts
│   │   └── compliance.ts
│   ├── core/             # Business logic
│   ├── engines/          # Banking engines
│   ├── middleware/       # Express middleware
│   ├── seed/             # Database seeding
│   ├── worker/           # Background workers
│   └── server.ts         # Entry point
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/       # Database migrations
├── tests/                # Test files
└── docker-compose.yml    # Docker configuration
```

---

## Docker Setup

### Development Mode

```bash
# Start in development mode (default)
docker-compose up

# Or explicitly:
docker-compose -f docker-compose.yml -f docker-compose.override.yml up
```

Features:
- Hot-reloading enabled
- Source code mounted
- Debug logging
- Swagger UI enabled

### Production Mode

```bash
# Start in production mode
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Features:
- Compiled JavaScript
- Auto-start simulation
- Resource limits
- Production logging

### Useful Docker Commands

```bash
# View logs
docker-compose logs -f sandbox-api

# Restart container
docker-compose restart sandbox-api

# Stop and remove
docker-compose down

# Rebuild image
docker-compose up --build

# Access container shell
docker exec -it nova_sandbox_api sh

# Reset database
docker-compose down -v  # Remove volumes
docker-compose up       # Fresh start
```

---

## Connecting Nova App

### Base Configuration

Add to your Nova app's environment:

```env
# .env or .env.local
SANDBOX_API_URL=http://localhost:4000
# Or for Docker networking:
# SANDBOX_API_URL=http://nova_sandbox_api:4000
```

### JavaScript/TypeScript SDK

```typescript
// sandboxClient.ts
const SANDBOX_URL = process.env.SANDBOX_API_URL || 'http://localhost:4000';

export const sandboxApi = {
  // Accounts
  async getAccounts(params?: { page?: number; limit?: number }) {
    const query = new URLSearchParams(params as any).toString();
    const res = await fetch(`${SANDBOX_URL}/accounts?${query}`);
    return res.json();
  },

  async getAccount(id: string) {
    const res = await fetch(`${SANDBOX_URL}/accounts/${id}`);
    return res.json();
  },

  // Transactions
  async getTransactions(accountId: string, params?: { status?: string }) {
    const query = new URLSearchParams(params as any).toString();
    const res = await fetch(`${SANDBOX_URL}/accounts/${accountId}/transactions?${query}`);
    return res.json();
  },

  async createTransaction(data: {
    accountId: string;
    type: 'credit' | 'debit';
    amount: number;
    description: string;
    category?: string;
  }) {
    const res = await fetch(`${SANDBOX_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Simulation Control
  async startSimulation() {
    const res = await fetch(`${SANDBOX_URL}/sandbox/simulation/start`, { method: 'POST' });
    return res.json();
  },

  async stopSimulation() {
    const res = await fetch(`${SANDBOX_URL}/sandbox/simulation/stop`, { method: 'POST' });
    return res.json();
  },

  async getSimulationStatus() {
    const res = await fetch(`${SANDBOX_URL}/sandbox/simulation/status`);
    return res.json();
  },

  // Chaos Mode (Testing)
  async setChaosMode(mode: 'normal' | 'latency' | 'flaky' | 'maintenance', options?: {
    latencyMs?: number;
    failureRate?: number;
  }) {
    const res = await fetch(`${SANDBOX_URL}/sandbox/mode`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ...options }),
    });
    return res.json();
  },

  // Phase 4 Engines
  async getFraudAlerts() {
    const res = await fetch(`${SANDBOX_URL}/fraud`);
    return res.json();
  },

  async getRiskEvents() {
    const res = await fetch(`${SANDBOX_URL}/risk`);
    return res.json();
  },

  async getLoans() {
    const res = await fetch(`${SANDBOX_URL}/loans`);
    return res.json();
  },

  async getCompliance() {
    const res = await fetch(`${SANDBOX_URL}/compliance`);
    return res.json();
  },
};
```

### Example Usage

```typescript
import { sandboxApi } from './sandboxClient';

// Get all accounts
const { accounts } = await sandboxApi.getAccounts({ limit: 10 });

// Start simulation
await sandboxApi.startSimulation();

// Create a test transaction
await sandboxApi.createTransaction({
  accountId: accounts[0].id,
  type: 'debit',
  amount: 5000, // $50.00 in cents
  description: 'Test purchase',
  category: 'shopping',
});

// Check for fraud alerts
const fraudData = await sandboxApi.getFraudAlerts();
console.log(`${fraudData.totalAlerts} fraud alerts detected`);

// Test error handling with chaos mode
await sandboxApi.setChaosMode('flaky', { failureRate: 0.3 });
```

### React Hook Example

```typescript
// useSandbox.ts
import { useEffect, useState } from 'react';
import { sandboxApi } from './sandboxClient';

export function useSandboxStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await sandboxApi.getSimulationStatus();
        setStatus(data);
      } catch (error) {
        console.error('Failed to fetch sandbox status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return { status, loading };
}
```

---

## API Documentation

### Interactive Docs

Once the server is running, access Swagger UI at:

```
http://localhost:4000/docs
```

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/accounts` | GET | List all accounts |
| `/accounts/:id` | GET | Get account details |
| `/accounts/:id/transactions` | GET | Get account transactions |
| `/transactions` | POST | Create transaction |
| `/transactions/:id` | GET | Get transaction |
| `/stats` | GET | Get statistics |

### Sandbox Control

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sandbox/simulation/start` | POST | Start simulation |
| `/sandbox/simulation/stop` | POST | Stop simulation |
| `/sandbox/simulation/status` | GET | Get simulation status |
| `/sandbox/simulation/trigger` | POST | Trigger one cycle |
| `/sandbox/mode` | PATCH | Set chaos mode |
| `/sandbox/mode/reset` | POST | Reset to normal |
| `/sandbox/stats` | GET | Comprehensive stats |
| `/sandbox/health` | GET | Health check |

### Phase 4 Engines

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/fraud` | GET | Fraud alerts summary |
| `/fraud/:id` | GET | Get fraud alert |
| `/fraud/:id/resolve` | POST | Resolve alert |
| `/risk` | GET | Risk events summary |
| `/risk/user/:id` | GET | User risk score |
| `/loans` | GET | Loan summary |
| `/loans/:id` | GET | Get loan details |
| `/loans/:id/payment` | POST | Make payment |
| `/portfolio` | GET | Portfolio summary |
| `/compliance` | GET | Compliance status |

---

## Configuration

### Simulation Modes

| Mode | Description |
|------|-------------|
| `random` | Varied transaction patterns (default) |
| `burst` | High-volume transaction bursts |
| `realistic` | Normal banking patterns |

### Chaos Modes

| Mode | Description |
|------|-------------|
| `normal` | No failures (default) |
| `latency` | Add artificial latency |
| `flaky` | Random failures at configured rate |
| `maintenance` | Return 503 for all requests |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | Server port |
| `HOST` | 0.0.0.0 | Server host |
| `NODE_ENV` | development | Environment |
| `DATABASE_URL` | file:./prisma/db/sandbox.db | Database path |
| `AUTO_START_SIMULATION` | false | Start simulation on boot |
| `SIMULATION_MODE` | random | Simulation mode |
| `SIMULATION_INTERVAL` | 3600000 | Interval between cycles (ms) |
| `ENABLE_SWAGGER` | true | Enable Swagger UI |
| `LOG_LEVEL` | info | Logging level |

---

## Troubleshooting

### Common Issues

#### Port already in use

```bash
# Find process using port 4000
lsof -i :4000

# Kill process
kill -9 <PID>
```

#### Database errors

```bash
# Reset database
rm -rf prisma/db/*
npx prisma migrate reset
npm run seed
```

#### Docker issues

```bash
# Remove all containers and volumes
docker-compose down -v

# Rebuild from scratch
docker-compose up --build
```

#### Prisma client issues

```bash
# Regenerate client
npx prisma generate

# Or with npm
npm run prisma:generate
```

### Getting Help

1. Check the [API Documentation](http://localhost:4000/docs)
2. View server logs: `docker-compose logs -f`
3. Check database with Prisma Studio: `npm run prisma:studio`
4. Open an issue on GitHub

---

## License

MIT © Nova Fintech
