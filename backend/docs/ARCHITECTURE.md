# SkyFi MCP Architecture

## Overview

SkyFi MCP is a Node.js/TypeScript application implementing the Model Context Protocol (MCP) for AI agents to interact with SkyFi's geospatial data platform.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        AI Agents                            │
│           (Claude, GPT, LangChain, ADK, etc.)              │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol (HTTP + SSE)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   SkyFi MCP Server                          │
│  ┌────────────────────────────────────────────────────┐    │
│  │           MCP Protocol Handler                      │    │
│  │  - Message parsing/validation                       │    │
│  │  - SSE event streaming                              │    │
│  │  - Request routing                                  │    │
│  └────────────┬───────────────────────────────────────┘    │
│               │                                              │
│  ┌────────────▼───────────────────────────────────────┐    │
│  │              API Layer                              │    │
│  │  - REST endpoints                                   │    │
│  │  - Authentication                                   │    │
│  │  - Rate limiting                                    │    │
│  └────────────┬───────────────────────────────────────┘    │
│               │                                              │
│  ┌────────────▼───────────────────────────────────────┐    │
│  │           Services Layer                            │    │
│  │  - Business logic                                   │    │
│  │  - Data validation                                  │    │
│  │  - Orchestration                                    │    │
│  └──────┬──────────────────┬─────────────────────────┘    │
│         │                  │                                │
│  ┌──────▼─────┐    ┌──────▼──────────┐                    │
│  │Integration │    │  Data Access    │                    │
│  │   Layer    │    │     Layer       │                    │
│  └─────┬──────┘    └───────┬─────────┘                    │
└────────┼──────────────────┼──────────────────────────────┘
         │                  │
    ┌────▼────┐        ┌───▼────┐
    │ SkyFi   │        │ Redis  │
    │   API   │        │ Cache  │
    └────┬────┘        └────────┘
         │
    ┌────▼────┐        ┌──────────┐
    │   OSM   │        │PostgreSQL│
    │   API   │        │ Database │
    └─────────┘        └──────────┘
```

## Technology Stack

### Core Framework
- **Runtime:** Node.js 20.x LTS
- **Language:** TypeScript 5.x
- **Framework:** Express.js 4.x

### Data Storage
- **Database:** PostgreSQL 15 (persistent data)
- **Cache:** Redis 7.x (sessions, rate limiting)

### External Services
- **SkyFi API:** Geospatial data provider
- **OpenStreetMap:** Geocoding and location services

### Development Tools
- **Testing:** Jest + Supertest
- **Linting:** ESLint + Prettier
- **CI/CD:** GitHub Actions
- **Containerization:** Docker + Docker Compose

## Layer Descriptions

### 1. MCP Protocol Layer

**Purpose:** Handle MCP protocol communication with AI agents

**Components:**
- Message parser and validator
- SSE (Server-Sent Events) handler
- Request/response formatter
- Protocol versioning

**Key Features:**
- Stateless communication
- Bidirectional streaming
- Error handling
- Protocol compliance

### 2. API Layer

**Purpose:** REST API endpoints and middleware

**Components:**
- Authentication middleware
- Rate limiting
- Request validation
- Response formatting
- Error handling

**Endpoints:**
- `/health` - Health check
- `/api/v1` - API base
- `/mcp/message` - MCP message endpoint
- `/mcp/sse` - MCP SSE endpoint

### 3. Services Layer

**Purpose:** Business logic and orchestration

**Services:**
- **SearchService:** Data exploration and search
- **OrderService:** Order management
- **MonitoringService:** AOI monitoring and webhooks
- **PricingService:** Cost estimation
- **AuthService:** Authentication and authorization

**Responsibilities:**
- Input validation
- Business rules enforcement
- Data transformation
- Service orchestration
- Error handling

### 4. Integration Layer

**Purpose:** External API clients

**Integrations:**
- **SkyFiClient:** SkyFi API wrapper
  - Archive search
  - Order management
  - Pricing
  - Monitoring/webhooks
- **OSMClient:** OpenStreetMap wrapper
  - Geocoding
  - Reverse geocoding
  - Location search

**Features:**
- Retry logic
- Rate limiting
- Error mapping
- Response caching
- Connection pooling

### 5. Data Access Layer

**Purpose:** Database operations

**Components:**
- **Models:** Data structures
  - User
  - Order
  - AOI (Area of Interest)
  - Webhook
  - Notification
- **Repositories:** Database queries
- **Migrations:** Schema management

## Data Flow

### Example: Search for Geospatial Data

```
1. AI Agent → MCP Protocol → "Search for satellite imagery of NYC"
                  ↓
2. MCP Handler → Parse request → Validate
                  ↓
3. API Layer → Authentication → Rate limit check
                  ↓
4. SearchService → Validate location → Transform request
                  ↓
5. OSMClient → Geocode "NYC" → Get coordinates
                  ↓
6. SkyFiClient → Archive search → Get results
                  ↓
7. SearchService → Format results → Cache
                  ↓
8. MCP Handler → Format response → Send to agent
```

## Security Architecture

### Authentication
- JWT tokens
- API key authentication
- Rate limiting per user/IP

### Authorization
- Role-based access control (RBAC)
- Resource-level permissions

### Data Protection
- HTTPS/TLS in transit
- Encrypted sensitive data at rest
- Secure credential storage

### API Security
- Helmet.js security headers
- CORS configuration
- Input validation (Zod)
- SQL injection prevention (parameterized queries)
- XSS protection

## Scalability Considerations

### Horizontal Scaling
- Stateless server design
- Load balancer compatible
- Session storage in Redis

### Caching Strategy
- Redis for frequently accessed data
- TTL-based cache invalidation
- Cache key patterns

### Database Optimization
- Indexed queries
- Connection pooling
- Read replicas (future)

### Performance
- Async/await patterns
- Non-blocking I/O
- Request queuing
- Response streaming

## Error Handling

### Error Types
- Validation errors (400)
- Authentication errors (401)
- Authorization errors (403)
- Not found errors (404)
- Rate limit errors (429)
- Internal errors (500)
- Service unavailable (503)

### Error Propagation
1. Service layer throws typed errors
2. Middleware catches and logs
3. Response formatter creates JSON
4. Client receives structured error

### Logging
- Winston logger
- Log levels: error, warn, info, debug
- Structured logging (JSON)
- Error stack traces in development

## Deployment Architecture

### Development
- Docker Compose
- Local PostgreSQL/Redis
- Hot reload (ts-node-dev)

### Production (Future)
- Kubernetes cluster
- Cloud-managed database (RDS)
- Cloud-managed cache (ElastiCache)
- Load balancer (ALB)
- Auto-scaling

## Monitoring & Observability

### Health Checks
- `/health` endpoint
- Database connectivity
- Redis connectivity
- External API health

### Metrics (Future)
- Request rate
- Response time
- Error rate
- Cache hit ratio
- Database query time

### Logging
- Application logs
- Access logs (Morgan)
- Error logs
- Audit logs

## Configuration Management

### Environment Variables
- `.env` file (development)
- Environment-specific configs
- Secrets management

### Configuration Validation
- Zod schema validation
- Fail-fast on missing/invalid config
- Type-safe configuration access

## Design Patterns

### Dependency Injection
- Service constructors receive dependencies
- Easy to mock for testing
- Loose coupling

### Repository Pattern
- Data access abstraction
- Testable data layer
- Database-agnostic queries

### Factory Pattern
- App creation (`createApp()`)
- Client creation
- Service initialization

### Middleware Pattern
- Express middleware chain
- Reusable request processing
- Cross-cutting concerns

## Future Enhancements

### Phase 2
- WebSocket support
- GraphQL API
- Advanced caching
- Circuit breaker pattern

### Phase 3
- Microservices architecture
- Event-driven design
- Message queue (RabbitMQ/SQS)
- CQRS pattern

### Phase 4
- Multi-region deployment
- CDN integration
- Advanced analytics
- Machine learning integration
