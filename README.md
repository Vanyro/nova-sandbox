# Nova Banking Sandbox API

> **🛠️ Developer Tool: Simulate Banking Operations Without Real APIs or Authentication**

[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-blue)](/.github/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)
[![API Docs](https://img.shields.io/badge/API%20Docs-Swagger-85EA2D?logo=swagger)](http://localhost:4000/docs)
[![Tests](https://img.shields.io/badge/Tests-22%20Passing-success)](/tests)

**Perfect for developers building fintech applications** who need realistic banking simulation without:
- ❌ Real banking API limitations and rate limits
- ❌ OAuth authentication and token management
- ❌ Risk of affecting real financial data
- ❌ Complex banking sandbox setups

A production-ready banking simulation API that replicates complete banking ecosystems for development, testing, and learning.

## 🎯 **Developer Use Cases**

### **Fintech App Development**
- Test payment flows and transaction processing
- Validate banking integrations safely
- Develop fraud detection algorithms
- Build financial dashboards and analytics

### **Quality Assurance & Testing**
- End-to-end banking workflow validation
- Load testing with realistic scenarios
- Integration testing for banking services
- Chaos engineering for failure simulation

### **Machine Learning & Research**
- Generate authentic financial datasets
- Train fraud detection models
- Analyze banking behavior patterns
- Research financial system dynamics

### **Educational Projects**
- Learn banking system architecture
- Practice API design and development
- Understand financial transaction flows
- Study fintech application patterns

## ✨ Features

### Core Banking Simulation

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

Get a fully functional banking API in under 5 minutes - perfect for testing fintech applications without real banking dependencies.

### Option 1: Docker (Recommended)

```bash
# Clone and start the banking simulation
git clone https://github.com/novafintech/nova_sandbox.git
cd nova_sandbox
docker-compose up -d

# Your banking API is now running!
curl http://localhost:4000/api/accounts
```

### Option 2: Local Development

```bash
# Install and setup
npm install
npx prisma generate && npx prisma migrate deploy && npm run seed

# Start development server
npm run dev

# Test your first API call
curl http://localhost:4000/api/accounts
```

### Immediate Developer Benefits

- ✅ **No API Keys Required** - Start testing immediately
- ✅ **Real Banking Data** - Pre-seeded with realistic accounts and transactions
- ✅ **Full CRUD Operations** - Create, read, update, delete banking data
- ✅ **Interactive Documentation** - Visit http://localhost:4000/docs
- ✅ **Postman Collection** - Import `./postman/` for instant testing

### Example: Test Your Fintech App

```javascript
// Replace real banking API calls with Nova Sandbox
const response = await fetch('http://localhost:4000/api/accounts');
const accounts = await response.json();

// Your app now works with realistic banking data!
console.log(accounts); // [{ id: 1, balance: 5000.00, type: 'checking' }, ...]
```

## 📖 Documentation

- **[Setup Guide](./SETUP.md)** - Comprehensive setup and integration guide
- **[API Documentation](http://localhost:4000/docs)** - Interactive Swagger UI
- **[Postman Collection](./postman/)** - Import into Postman for testing

## 🏗️ What You Get

A complete banking simulation environment with production-ready APIs and realistic data.

```
nova_sandbox/
├── src/
│   ├── api/               # 15+ REST API endpoints
│   │   ├── accounts.ts    # Account management
│   │   ├── transactions.ts # Money movement
│   │   ├── fraud.ts       # Fraud detection
│   │   ├── risk.ts        # Risk assessment
│   │   ├── loans.ts       # Loan processing
│   │   ├── portfolio.ts   # Investment tracking
│   │   └── compliance.ts  # KYC/AML screening
│   ├── engines/           # Advanced banking logic
│   │   ├── fraud.ts       # Pattern analysis engine
│   │   ├── risk.ts        # Scoring algorithms
│   │   ├── loans.ts       # Lending workflows
│   │   ├── investment.ts  # Market simulation
│   │   └── compliance.ts  # Regulatory checks
│   ├── core/              # Business logic & utilities
│   ├── middleware/        # Chaos engineering tools
│   ├── seed/              # Realistic test data
│   └── worker/            # Transaction simulation
├── prisma/                # Database layer (13 models)
├── tests/                 # 22 integration tests
├── postman/               # Ready-to-import collections
└── docker/                # Production containers
```

### Pre-Seeded Data

- **6 User Personas** - Spender, Saver, Investor, Business, Student, Senior
- **Realistic Accounts** - Checking, savings, credit cards, loans, investments
- **Transaction History** - 1000+ transactions with patterns and anomalies
- **Market Data** - Simulated stock prices and investment performance
- **Compliance Records** - KYC status, sanctions screening, risk profiles

## 🎮 Developer Use Cases

### 1. **Payment App Development**
Replace Stripe/PayPal API calls with Nova Sandbox for instant testing:

```javascript
// Instead of: const payment = await stripe.charges.create({...})
const payment = await fetch('http://localhost:4000/api/transactions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    accountId: 'user-123',
    amount: 29.99,
    type: 'debit',
    description: 'Premium Subscription'
  })
});
```

### 2. **Banking Dashboard**
Build UIs with realistic account data:

```javascript
const accounts = await fetch('http://localhost:4000/api/accounts').then(r => r.json());
const transactions = await fetch('http://localhost:4000/api/transactions').then(r => r.json());

// Now build your dashboard with real banking data!
console.log('User has:', accounts.length, 'accounts');
console.log('Recent transactions:', transactions.slice(0, 5));
```

### 3. **Fraud Detection Testing**
Test your fraud algorithms against realistic patterns:

```javascript
// Get fraud alerts
const alerts = await fetch('http://localhost:4000/api/fraud').then(r => r.json());

// Test your fraud detection logic
alerts.forEach(alert => {
  if (alert.riskScore > 0.8) {
    console.log('High-risk transaction detected:', alert.transactionId);
  }
});
```

### 4. **Loan Application Flow**
Simulate the complete lending process:

```javascript
// Submit loan application
const loan = await fetch('http://localhost:4000/api/loans', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    accountId: 'user-123',
    amount: 25000,
    termMonths: 36,
    purpose: 'home_improvement'
  })
});

// Check loan status
const status = await fetch(`http://localhost:4000/api/loans/${loan.id}`).then(r => r.json());
```

### 5. **Investment Portfolio**
Test robo-advisor features:

```javascript
const portfolio = await fetch('http://localhost:4000/api/portfolio').then(r => r.json());

// Analyze portfolio performance
const totalValue = portfolio.holdings.reduce((sum, h) => sum + h.value, 0);
const gainLoss = portfolio.holdings.reduce((sum, h) => sum + h.gainLoss, 0);
```

### Chaos Engineering Examples

Test your app's resilience:

```bash
# Simulate network latency
curl -X PATCH http://localhost:4000/sandbox/chaos \
  -d '{"type": "latency", "value": 3000}'

# Test error handling
curl -X PATCH http://localhost:4000/sandbox/chaos \
  -d '{"type": "errors", "value": 0.5}'  # 50% error rate

# Simulate maintenance mode
curl -X PATCH http://localhost:4000/sandbox/chaos \
  -d '{"type": "maintenance", "value": true}'
```

## 🧪 Testing Your Fintech App

### Automated Tests
```bash
# Run the full test suite (22 passing tests)
npm test

# Test specific banking features
npm run test:accounts    # Account management
npm run test:transactions # Money movement
npm run test:fraud       # Fraud detection
npm run test:loans       # Lending workflows
```

### Manual Testing with Postman
```bash
# Import the ready-to-use collection
# File: ./postman/Nova_Banking_Sandbox.postman_collection.json

# Pre-configured environments:
# - Development: http://localhost:4000
# - Production: https://your-domain.com

# Test scenarios included:
# ✓ Account creation and management
# ✓ Transaction processing
# ✓ Fraud detection workflows
# ✓ Loan application flows
# ✓ Investment portfolio tracking
# ✓ Chaos engineering scenarios
```

### Integration Testing Example
```javascript
// test/integration/payment-app.test.js
const { expect } = require('chai');

describe('Payment App Integration', () => {
  it('should process payment successfully', async () => {
    // Use Nova Sandbox instead of real banking API
    const response = await fetch('http://localhost:4000/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: 'test-user-123',
        amount: 99.99,
        type: 'debit',
        description: 'Premium subscription'
      })
    });

    expect(response.status).to.equal(201);
    const transaction = await response.json();
    expect(transaction.status).to.equal('completed');
  });
});
```

## 🔧 Configuration

### For Development Teams

```env
# Basic setup
PORT=4000
NODE_ENV=development
DATABASE_URL=file:./prisma/db/sandbox.db

# Customize simulation behavior
AUTO_START_SIMULATION=true          # Start generating transactions automatically
SIMULATION_MODE=realistic           # realistic | random | burst
SIMULATION_INTERVAL=10000           # Generate new transactions every 10s

# Enable developer tools
ENABLE_SWAGGER=true                 # Interactive API docs at /docs
LOG_LEVEL=debug                     # Detailed logging for debugging

# Chaos engineering (for testing resilience)
CHAOS_LATENCY_MS=0                  # Add artificial latency
CHAOS_ERROR_RATE=0                  # Simulate random errors (0.0-1.0)
CHAOS_MAINTENANCE_MODE=false       # Simulate service maintenance
```

### Docker Configuration

```yaml
# docker-compose.override.yml for development
version: '3.8'
services:
  nova-sandbox:
    environment:
      - NODE_ENV=development
      - AUTO_START_SIMULATION=true
      - SIMULATION_MODE=realistic
    ports:
      - "4000:4000"
    volumes:
      - ./logs:/app/logs
```

### Production Deployment

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  nova-sandbox:
    image: novafintech/nova_sandbox:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=file:./data/sandbox.db
      - ENABLE_SWAGGER=false
      - LOG_LEVEL=info
    volumes:
      - ./data:/app/prisma/db
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

Complete REST API for banking simulation - use these endpoints to replace real banking APIs in your development.

### Core Banking APIs

```javascript
// Account Management
GET  /api/accounts              // List all accounts
GET  /api/accounts/:id          // Get account details
GET  /api/accounts/:id/balance  // Current balance

// Transaction Processing
POST /api/transactions          // Create new transaction
GET  /api/transactions          // List transactions
GET  /api/transactions/:id      // Transaction details

// Analytics
GET  /api/stats                 // Dashboard statistics
GET  /api/stats/transactions    // Transaction analytics
```

### Advanced Banking Features

```javascript
// Fraud Detection
GET  /api/fraud                 // Active fraud alerts
GET  /api/fraud/:id             // Alert details
POST /api/fraud/report          // Report suspicious activity

// Risk Management
GET  /api/risk/scores           // User risk scores
GET  /api/risk/events           // Risk assessment events

// Lending
GET  /api/loans                 // Loan portfolio
POST /api/loans                 // Apply for loan
GET  /api/loans/:id/payments    // Loan payment schedule

// Investments
GET  /api/portfolio             // Investment portfolio
GET  /api/portfolio/performance // Performance metrics
POST /api/portfolio/trade       // Execute trade

// Compliance
GET  /api/compliance/checks     // Compliance status
POST /api/compliance/kyc        // Submit KYC documents
```

### Simulation Control

```javascript
// Control transaction generation
POST /api/sandbox/simulation/start   // Start auto-simulation
POST /api/sandbox/simulation/stop    // Stop simulation
POST /api/sandbox/simulation/trigger // Generate one transaction

// Chaos engineering
PATCH /api/sandbox/chaos             // Enable failure modes
  // { "latency": 2000, "errorRate": 0.1, "maintenance": false }
```

### Interactive Documentation

Visit `http://localhost:4000/docs` for:
- ✅ Complete OpenAPI/Swagger documentation
- ✅ Try-it-out functionality for all endpoints
- ✅ Request/response examples
- ✅ Authentication details (none required!)

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
const SANDBOX_URL = "http://localhost:4000";

export const sandboxApi = {
  async getAccounts() {
    const res = await fetch(`${SANDBOX_URL}/accounts`);
    return res.json();
  },

  async createTransaction(data) {
    const res = await fetch(`${SANDBOX_URL}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async startSimulation() {
    const res = await fetch(`${SANDBOX_URL}/sandbox/simulation/start`, {
      method: "POST",
    });
    return res.json();
  },
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

## � Get Started Now

### 1. Clone & Run
```bash
git clone https://github.com/novafintech/nova_sandbox.git
cd nova_sandbox
docker-compose up -d
```

### 2. Test Your First API Call
```bash
curl http://localhost:4000/api/accounts
```

### 3. Explore the Documentation
Visit http://localhost:4000/docs for interactive API testing

### 4. Import Postman Collection
Use `./postman/Nova_Banking_Sandbox.postman_collection.json` for comprehensive testing

---

## 🎯 Perfect For

- **Fintech Startups** - Test payment flows without real banking APIs
- **Banking Apps** - Develop UIs with realistic data
- **Integration Testing** - Validate third-party banking integrations
- **Learning Projects** - Understand banking APIs and workflows
- **Demo Environments** - Showcase fintech products with real data

## 📝 License

MIT © Nova Fintech

## 🙏 Acknowledgments

Built with modern tools for developer productivity:

- [Fastify](https://www.fastify.io/) - High-performance web framework
- [Prisma](https://www.prisma.io/) - Type-safe database access
- [TypeScript](https://www.typescriptlang.org/) - Enhanced developer experience
- [Docker](https://www.docker.com/) - Consistent deployment

---

**Ready to build the next banking innovation?** Your sandbox is waiting at http://localhost:4000 🚀

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
