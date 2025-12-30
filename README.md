# Nova Sandbox Backend API

A containerized backend sandbox API built with Fastify, Prisma, and SQLite.

## Features

- 🚀 **Fastify** - Fast and low overhead web framework
- 🗄️ **Prisma** - Next-generation ORM for TypeScript
- 💾 **SQLite** - Lightweight database (easily switchable)
- 🐳 **Docker** - Containerized development environment
- 📦 **TypeScript** - Full type safety

## Project Structure

```
nova-sandbox/
├── .github/workflows/   # CI/CD pipelines
├── docker/              # Dockerfiles and config
├── prisma/              # Database schema and migrations
├── src/
│   ├── api/             # Routes and Controllers
│   ├── core/            # Transaction & Math logic
│   ├── seed/            # Historical data generators
│   └── worker/          # Background cron tasks
├── tests/               # Unit and Integration tests
└── docker-compose.yml   # Infrastructure orchestration
```

## Database Schema

- **Users**: id, name, email, role, createdAt
- **Accounts**: id, userId, type, balance, createdAt
- **Transactions**: id, accountId, type (credit/debit), amount, createdAt

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (optional)

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Setup database**:
   ```bash
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

ISC
