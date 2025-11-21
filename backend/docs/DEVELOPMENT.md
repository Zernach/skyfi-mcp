# Development Guide

## Prerequisites

- Node.js 20.x or higher
- Docker and Docker Compose
- Git

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd skyfi-mcp
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` and set required values:
- `POSTGRES_PASSWORD` - Database password
- `SKYFI_API_KEY` - Your SkyFi API key
- `JWT_SECRET` - Secret for JWT tokens

### 4. Start Development Environment

#### Option A: Using Docker (Recommended)

```bash
npm run docker:up
```

This starts:
- SkyFi MCP application (port 3000)
- PostgreSQL database (port 5432)
- Redis cache (port 6379)

#### Option B: Local Development

Start services manually:

```bash
# Start PostgreSQL and Redis via Docker
docker-compose up -d postgres redis

# Start the application in development mode
npm run dev
```

### 5. Verify Installation

Check the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-18T...",
  "version": "1.0.0"
}
```

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Lint code
- `npm run lint:fix` - Lint and auto-fix issues
- `npm run format` - Format code with Prettier
- `npm run docker:up` - Start Docker services
- `npm run docker:down` - Stop Docker services
- `npm run docker:logs` - View Docker logs

## Project Structure

```
skyfi-mcp/
├── src/
│   ├── api/          # REST API endpoints
│   ├── mcp/          # MCP protocol handlers
│   ├── services/     # Business logic
│   ├── integrations/ # External API clients (SkyFi, OSM)
│   ├── models/       # Data models
│   ├── middleware/   # Express middleware
│   ├── utils/        # Utility functions
│   ├── config/       # Configuration
│   ├── app.ts        # Express app setup
│   └── index.ts      # Entry point
├── tests/
│   ├── unit/         # Unit tests
│   └── integration/  # Integration tests
├── docs/             # Documentation
├── docker/           # Docker-related files
└── logs/             # Application logs
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Write code following TypeScript best practices
- Add tests for new functionality
- Update documentation as needed

### 3. Run Tests

```bash
npm test
npm run lint
```

### 4. Commit Changes

```bash
git add .
git commit -m "feat: description of your changes"
```

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

## Testing

### Unit Tests

Located in `tests/unit/`, test individual functions and classes:

```bash
npm test tests/unit/
```

### Integration Tests

Located in `tests/integration/`, test API endpoints and database operations:

```bash
npm test tests/integration/
```

### Coverage Reports

```bash
npm run test:coverage
```

View HTML report: `open coverage/lcov-report/index.html`

## Debugging

### VS Code

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/src/index.ts",
      "preLaunchTask": "npm: build",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"]
    }
  ]
}
```

### Docker Logs

```bash
# All services
npm run docker:logs

# Specific service
docker-compose logs -f app
docker-compose logs -f postgres
```

## Database

### Migrations

Migrations are located in `docker/postgres/`.

To run migrations manually:

```bash
# Connect to database
docker-compose exec postgres psql -U skyfi_user -d skyfi_mcp

# Run SQL scripts
\i /docker-entrypoint-initdb.d/init.sql
```

### Access PostgreSQL

```bash
docker-compose exec postgres psql -U skyfi_user -d skyfi_mcp
```

### Access Redis

```bash
docker-compose exec redis redis-cli
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Docker Issues

```bash
# Clean up Docker
docker-compose down -v
docker system prune -a

# Rebuild
npm run docker:up
```

### Dependencies Issues

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

## Code Style

- Use TypeScript strict mode
- Follow ESLint rules
- Use Prettier for formatting
- Write JSDoc comments for public APIs
- Use meaningful variable names
- Keep functions small and focused

## Git Commit Messages

Follow conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test changes
- `refactor:` - Code refactoring
- `chore:` - Build/config changes

## Resources

- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Jest Testing](https://jestjs.io/docs/getting-started)
- [Docker Compose](https://docs.docker.com/compose/)
