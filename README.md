# Nova Banking Sandbox API

> **A comprehensive banking simulation API for testing and development - Phase 4 Complete! 🎉**

[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-blue)](/.github/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)
[![API Docs](https://img.shields.io/badge/API%20Docs-Swagger-85EA2D?logo=swagger)](http://localhost:4000/docs)
[![Tests](https://img.shields.io/badge/Tests-22%20Passing-success)](/tests)

A production-ready banking sandbox that simulates a complete banking system with real-time fraud detection, risk scoring, loan management, investment portfolios, compliance monitoring, and chaos engineering capabilities.

## ✨ Features

### Core Banking
- 🏦 **Account Management** - Multi-type accounts (checking, savings, investment)
- 💳 **Transaction Processing** - Full lifecycle (pending → posted/canceled)
- 📊 **Analytics & Reporting** - Real-time statistics and insights
- 🎭 **Persona-Based Simulation** - 6 realistic user types (spender, saver, investor, etc.)

### Phase 4: Advanced Banking Engines
- 🕵️ **Fraud Detection** - Real-time pattern analysis (velocity, geolocation, duplicates)
- ⚠️ **Risk Scoring** - Automatic user risk assessment (low → critical)
- 💰 **Loan Management** - Full loan lifecycle with automatic payments and defaults
- 📈 **Investment Portfolio** - Market simulation with price fluctuations
- ⚖️ **Compliance Monitoring** - KYC/AML/Sanctions screening

### Developer Tools
- 💥 **Chaos Engineering** - Test failure modes (latency, flaky, maintenance)
- 🎮 **Simulation Control** - Automatic or manual transaction generation
- 📚 **OpenAPI/Swagger** - Interactive API documentation
- 🧪 **Postman Collection** - Ready-to-use API testing

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone and start
git clone https://github.com/novafintech/nova_sandbox.git
cd nova_sandbox
docker-compose up -d

# Access the API
open http://localhost:4000
open http://localhost:4000/docs  # Swagger UI
```

### Option 2: Local Node.js

```bash
# Install dependencies
npm install

# Setup database
npx prisma generate
npx prisma migrate deploy
npm run seed

# Start development server
npm run dev

# Access at http://localhost:4000
```

## 📖 Documentation

- **[Setup Guide](./SETUP.md)** - Comprehensive setup and integration guide
- **[API Documentation](http://localhost:4000/docs)** - Interactive Swagger UI
- **[Postman Collection](./postman/)** - Import into Postman for testing

## 🏗️ Project Structure

```
nova_sandbox/
├── .github/workflows/      # CI/CD pipeline
│   └── ci.yml             # GitHub Actions workflow
├── src/
│   ├── api/               # API route handlers
│   │   ├── accounts.ts
│   │   ├── transactions.ts
│   │   ├── fraud.ts       # Phase 4
│   │   ├── risk.ts        # Phase 4
│   │   ├── loans.ts       # Phase 4
│   │   ├── portfolio.ts   # Phase 4
│   │   └── compliance.ts  # Phase 4
│   ├── engines/           # Banking engines
│   │   ├── fraud.ts       # Fraud detection engine
│   │   ├── risk.ts        # Risk scoring engine
│   │   ├── loans.ts       # Loan management engine
│   │   ├── investment.ts  # Portfolio & market engine
│   │   └── compliance.ts  # KYC/AML/Sanctions engine
│   ├── core/              # Business logic
│   ├── middleware/        # Chaos engineering
│   ├── seed/              # Database seeding
│   ├── worker/            # Simulation engine
│   └── server.ts          # Entry point
├── prisma/
│   ├── schema.prisma      # Database schema (13 models)
│   └── migrations/        # Migration history
├── tests/                 # Integration tests (22 passing)
├── postman/               # Postman collection & environments
├── docker-compose.yml     # Development setup
├── docker-compose.prod.yml # Production setup
└── SETUP.md              # Complete setup guide
```

## 🎮 Usage Examples

### Start Simulation

```bash
curl -X POST http://localhost:4000/sandbox/simulation/start
```

### Create Transaction

```bash
curl -X POST http://localhost:4000/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "uuid",
    "type": "debit",
    "amount": 5000,
    "description": "Coffee shop"
  }'
```

### Check Fraud Alerts

```bash
curl http://localhost:4000/fraud
```

### Enable Chaos Mode

```bash
curl -X PATCH http://localhost:4000/sandbox/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "latency", "latencyMs": 2000}'
```

## 🧪 Testing

```bash
# Run all tests (22 tests)
npm test

# Run specific test suite
npm run test:phase3

# Start server and test manually
npm run dev
# Then import Postman collection from /postman
```

## 🔧 Configuration

### Environment Variables

```env
PORT=4000
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL=file:./prisma/db/sandbox.db

# Simulation
AUTO_START_SIMULATION=false
SIMULATION_MODE=random           # random | burst | realistic
SIMULATION_INTERVAL=30000        # milliseconds

# Features
ENABLE_SWAGGER=true
LOG_LEVEL=debug
```

## 📊 Database Schema

### Core Models (Phase 1-3)
- **User** - Customer profiles with personas
- **Account** - Bank accounts (checking/savings/investment)
- **Transaction** - Transaction history with full lifecycle
- **SimulationState** - Sandbox control state

### Phase 4 Models
- **FraudAlert** - Detected fraud patterns
- **RiskEvent** - Risk assessment events  
- **UserRiskScore** - Real-time risk scores
- **Loan** - Loan applications and payments
- **Portfolio** - Investment portfolios
- **Holding** - Individual asset holdings
- **MarketAsset** - Simulated market assets
- **ComplianceCheck** - KYC/AML/Sanctions records
- **KYCRecord** - Identity verification

## 🎯 API Endpoints

### Core Banking
- `GET /accounts` - List accounts
- `GET /accounts/:id` - Get account details
- `GET /accounts/:id/transactions` - Account transactions
- `POST /transactions` - Create transaction
- `GET /stats` - Statistics and analytics

### Simulation Control
- `POST /sandbox/simulation/start` - Start simulation
- `POST /sandbox/simulation/stop` - Stop simulation
- `GET /sandbox/simulation/status` - Check status
- `POST /sandbox/simulation/trigger` - Manual trigger

### Phase 4 Engines
- `GET /fraud` - Fraud alerts summary
- `GET /risk` - Risk events and scores
- `GET /loans` - Loan portfolio
- `POST /loans/apply` - Apply for loan
- `GET /portfolio` - Investment portfolio
- `GET /compliance` - Compliance status

### Chaos Engineering
- `PATCH /sandbox/mode` - Set chaos mode
- `POST /sandbox/mode/reset` - Reset to normal

[View complete API documentation →](http://localhost:4000/docs)

## 🐳 Docker Commands

```bash
# Development
docker-compose up                    # Start dev environment
docker-compose logs -f sandbox-api   # View logs
docker-compose restart               # Restart server

# Production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Cleanup
docker-compose down -v               # Remove everything
docker-compose up --build            # Rebuild and start
```

## 📦 Scripts

```bash
npm run dev            # Development with hot-reload
npm run build          # Build for production
npm start              # Start production server
npm test               # Run tests

# Database
npm run prisma:migrate # Run migrations
npm run prisma:studio  # Open Prisma Studio
npm run seed           # Seed database
npm run seed:reset     # Reset and reseed
npm run seed:stress    # Large dataset

# Simulation
npm run simulation:start # Start simulation directly
```

## 🤝 Integration Guide

### Connect Your Nova App

```typescript
// sandboxClient.ts
const SANDBOX_URL = 'http://localhost:4000';

export const sandboxApi = {
  async getAccounts() {
    const res = await fetch(`${SANDBOX_URL}/accounts`);
    return res.json();
  },
  
  async createTransaction(data) {
    const res = await fetch(`${SANDBOX_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  
  async startSimulation() {
    const res = await fetch(`${SANDBOX_URL}/sandbox/simulation/start`, {
      method: 'POST'
    });
    return res.json();
  }
};
```

[See complete integration guide →](./SETUP.md#connecting-nova-app)

## 🎭 User Personas

The sandbox includes 6 realistic user personas:

- 💸 **Spender** - High transaction frequency, varied merchants
- 💰 **Saver** - Low spending, regular deposits
- 📈 **Investor** - Stock purchases, long-term holds
- 🍽️ **Foodie** - Restaurant and delivery focused
- 🛍️ **Shopper** - Retail therapy enthusiast
- ⚖️ **Balanced** - Mixed spending patterns

## 🏆 Test Coverage

- ✅ **22 integration tests** - All passing
- ✅ **Account management** - Create, update, freeze
- ✅ **Transaction lifecycle** - Pending → Posted/Canceled
- ✅ **Simulation control** - Start, stop, trigger
- ✅ **Chaos engineering** - All chaos modes
- ✅ **Statistics** - Analytics and reporting

## 📈 Simulation Metrics

When simulation is running:
- **Transaction Generation** - Realistic banking patterns
- **Fraud Detection** - ~5-10% of transactions flagged
- **Risk Scoring** - Automatic user risk level updates
- **Loan Processing** - Daily payment collection & default detection
- **Market Updates** - Asset price fluctuations
- **Compliance Checks** - AML transaction screening

## 🚀 CI/CD Pipeline

Automated GitHub Actions workflow:
- ✅ Lint & Type Check
- ✅ Run Tests
- ✅ Build Application
- ✅ Docker Image Build & Push
- ✅ Security Scanning (Trivy)
- ✅ SBOM Generation

## 📝 License

MIT © Nova Fintech

## 🙏 Acknowledgments

Built with:
- [Fastify](https://www.fastify.io/) - Web framework
- [Prisma](https://www.prisma.io/) - Database ORM
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Docker](https://www.docker.com/) - Containerization

---

**Ready to test your banking app?** Start the sandbox and explore the API at http://localhost:4000/docs 🚀
   npm run prisma:generate
   npm run prisma:migrate
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Access the API**:
   - Health check: http://localhost:4000/health

### Docker Development

1. **Build and start**:
   ```bash
   docker-compose up --build
   ```

2. **Access the API**:
   - Health check: http://localhost:4000/health

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations

## Environment Variables

Create a `.env` file in the root directory:

```env
PORT=4000
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL="file:./prisma/dev.db"
```

## API Endpoints

### Health Check
```
GET /health
Response: { "status": "ok" }
```

## License

Mohamed aziz kammoun