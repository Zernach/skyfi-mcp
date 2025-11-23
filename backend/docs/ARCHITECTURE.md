# SkyFi MCP Architecture

## Overview

SkyFi MCP is a production-ready Node.js/TypeScript application implementing the Model Context Protocol (MCP) for AI agents to interact with SkyFi's geospatial data platform.

**Version:** 2.0.0  
**Status:** ✅ Production Ready  
**Last Updated:** November 23, 2025  
**Recent Update:** Enhanced authentication and payment validation with real-time API key verification and comprehensive security checks

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        AI Agents                            │
│      (Claude, GPT, LangChain, ADK, Voice Assistant)        │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol (HTTP + SSE)
                       │
                       │  ┌─────────────────────────────────┐
                       │  │    Voice Assistant (Frontend)   │
                       │  │  - OpenAI Realtime API          │
                       │  │  - Tool calling integration     │
                       └──┼──skyfi_satellite_assistant tool │
                          └─────────────┬───────────────────┘
                                        │ REST API
┌───────────────────────────────────────▼─────────────────────┐
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
│  │  - Chat service (LLM + tool execution)             │    │
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

## Recent Enhancements (November 2025)

### New Capabilities Added
The SkyFi MCP server has been significantly enhanced with new tools and capabilities:

1. **✅ AOI Monitoring** - Continuous monitoring of geographic areas with automatic notifications when new satellite imagery becomes available
2. **✅ Webhook Management** - Complete webhook system for event-driven integrations:
   - Webhook creation and registration with SkyFi API
   - Webhook receiver endpoints with HMAC signature verification
   - Notification logging and tracking
   - Support for all SkyFi events (orders, tasking, AOI alerts)
   - Automated event processing and routing
3. **Satellite Intelligence** - Comprehensive satellite catalog with capabilities, comparison, and AI-powered recommendations
4. **Batch Operations** - Efficient bulk order processing
5. **Health Monitoring** - Detailed server health checks and diagnostics
6. **Enhanced Validation** - Pre-order validation with detailed pricing breakdowns
7. **✨ Iterative Search Sessions** - Stateful search sessions with pagination, refinement, and history tracking
8. **✨ Order History Exploration** - Session-based order browsing with filtering and navigation

### Total Tool Count: 26 Tools
The MCP server now provides 26 specialized tools covering the full satellite imagery workflow from discovery to delivery, plus operational tools for monitoring and optimization.

## Voice Assistant Integration

### Overview
The SkyFi platform includes a voice assistant powered by OpenAI's Realtime API that integrates directly with the MCP backend as a tool-calling interface. This allows users to interact with satellite imagery capabilities through natural voice commands.

### Architecture
```
Voice/Text User → OpenAI Realtime API / Chat Widget → Unified Tool Registry (Frontend)
                                                              │
                                         ┌────────────────────┼────────────────────┐
                                         │                    │                    │
                                    Voice Assistant      ChatWidget         Shared Tools
                                         │                    │                    │
                                         └────────────────────┴────────────────────┘
                                                              │
                           ┌──────────────────────────────────┼──────────────────────────────────┐
                           │                                  │                                  │
                    Client-side Tools                         │                        Backend Tools
                    (Map interactions)                        │                    (Satellite imagery)
                           │                                  │                                  │
                    ├─ fly_to_place                           │                    MCP Backend (/mcp/message)
                    ├─ map_fly_to                             │                            │
                    ├─ get_weather                            │                    ├─ Chat Service
                    ├─ get_last_rain                          │                    ├─ Tool Executor (12 tools)
                    └─ lookup_bounding_box                    │                    └─ SkyFi API Integration
                                                              │
                                                   skyfi_satellite_assistant
                                                     (bridges both worlds)
```

### skyfi_satellite_assistant Tool
**Purpose:** Provides the voice assistant with access to the full SkyFi MCP backend capabilities through natural language queries.

**Capabilities (17 Tools):**

#### Search & Discovery
- Search satellite imagery archive with iterative sessions
- Geocode location names to coordinates
- Reverse geocode coordinates to addresses

#### Ordering & Pricing  
- **NEW:** Confirm orders with price validation and feasibility checks
- Create orders for satellite images
- Request new satellite captures (tasking)
- Estimate pricing for imagery requests
- Assess task feasibility with risk analysis
- Explore and compare pricing options

#### Order Management
- Check order and tasking status
- List and explore previous orders with pagination

#### AOI Monitoring (NEW)
- Setup area of interest monitoring
- List active monitoring configurations
- Update monitoring criteria and settings
- Delete monitoring and stop notifications

#### Authentication & Payment (NEW)
- Validate authentication before orders
- Check payment method status
- Enforce spending limits
- Provide payment confirmations

**Implementation:**
- **Shared Registry:** `frontend/src/lib/tools/registry.ts` - Unified tool definitions and handlers
- **Voice Assistant:** `RealtimeVoiceModal.tsx` - Uses shared registry with OpenAI Realtime API
- **Chat Widget:** `ChatWidget.tsx` - Uses shared registry with REST API
- **Backend:** `/mcp/message` endpoint - Processes tool requests via chat service
- **Protocol:** REST API with JSON-RPC 2.0 format

**Example Flow:**
1. User speaks: "Search for satellite imagery of Tokyo from last month"
2. OpenAI Realtime API transcribes and identifies tool call
3. Voice Assistant calls `skyfi_satellite_assistant` with query
4. Frontend sends POST to `/mcp/message` with MCP format
5. Backend chat service processes with LLM + tool execution
6. Results returned through response chain
7. Voice Assistant speaks results to user

### Unified Tool Registry (DRY Architecture)
The frontend implements a **shared tool registry** (`frontend/src/lib/tools/registry.ts`) that both the Voice Assistant and Chat Widget use. This eliminates code duplication and ensures consistent behavior across interfaces.

**Key Components:**
- **TOOL_DEFINITIONS:** Array of tool schemas (definitions) used by both components
- **TOOL_HANDLERS:** Unified execution logic for all tools
- **executeTool():** Single entry point for tool execution with context
- **ToolExecutionContext:** Shared context for map interactions and conversation state

**Shared Tools:**
1. `fly_to_place` - Fast navigation combining geocoding + map control
2. `lookup_bounding_box` - Geocoding service (OpenStreetMap)
3. `get_weather` - Current weather data (Open-Meteo API)
4. `get_last_rain` - Rainfall history (Open-Meteo Archive)
5. `skyfi_satellite_assistant` - Full MCP backend access (calls `/mcp/message`)
6. `map_fly_to` - Direct coordinate navigation

**Benefits:**
- **DRY Principle:** Zero code duplication between voice and chat interfaces
- **Consistency:** Identical tool behavior across all interaction modes
- **Maintainability:** Single source of truth for tool definitions and handlers
- **Extensibility:** Add new tools once, available everywhere automatically
- **Natural interaction:** Users can request satellite imagery through voice or text
- **Full MCP access:** All backend tools available to both interfaces
- **Conversational context:** Backend maintains conversation history

## Layer Descriptions

### 1. MCP Protocol Layer

**Purpose:** Handle MCP protocol communication with AI agents

**Components:**
- Message parser and validator
- SSE (Server-Sent Events) handler
- Request/response formatter
- Protocol versioning

**Key Features:**
- **Stateless HTTP + SSE Communication**
  - HTTP POST for sending messages (completely stateless)
  - SSE for receiving real-time streaming updates
  - Automatic reconnection with exponential backoff
  - Client-side connection management
- Bidirectional streaming
- Error handling
- Protocol compliance

**Stateless HTTP + SSE Architecture:**
```
Client                           Backend
  │                                │
  ├─ HTTP POST /mcp/message ──────>│
  │  (stateless request)           │
  │                                ├─ Acknowledge request
  │<─ 200 OK (immediate) ──────────┤
  │                                │
  │                                ├─ Process (async)
  │                                │  ├─ LLM thinking
  │                                │  ├─ Tool execution
  │                                │  └─ Generate response
  │                                │
  ├─ SSE /mcp/sse?clientId=xyz ───>│
  │  (long-lived connection)       │
  │                                │
  │<─ event: processing_started ───┤
  │<─ event: progress ─────────────┤
  │<─ event: progress ─────────────┤
  │<─ event: processing_complete ──┤
  │                                │
```

**Benefits:**
- **Stateless**: Each HTTP request is independent, no server-side session
- **Real-time**: SSE provides instant updates without polling
- **Scalable**: Horizontally scalable with load balancers
- **Resilient**: Automatic reconnection on connection loss
- **Efficient**: Single SSE connection for multiple requests

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
- `/mcp/message` - MCP message endpoint (JSON-RPC 2.0)
- `/mcp/sse` - MCP SSE endpoint (Server-Sent Events)
- `/mcp/status` - MCP server status and connection count

**MCP Methods:**
- `chat` - Send natural language queries with LLM + tool-calling
- `listTools` - Get available SkyFi tool names and count
- Conversation management methods

**Available SkyFi Tools (via chat method):**

**Core Satellite Imagery Tools:**
1. `search_satellite_imagery` - Search archive with filters and pagination
2. `create_satellite_order` - Purchase satellite images (requires feasibility check first)
3. `request_satellite_tasking` - Request new satellite captures (requires feasibility check first)
4. `get_order_status` - Check order progress and delivery
5. `list_orders` - Browse order history with filters
6. `estimate_price` - Calculate pricing for imagery requests
7. `assess_task_feasibility` - Evaluate feasibility with recommendations (REQUIRED before orders)
8. `explore_pricing_options` - Compare archive vs tasking pricing
9. `get_tasking_status` - Track satellite capture requests
10. `confirm_order_with_pricing` - Pre-order validation and pricing breakdown (REQUIRED before orders)

**Order Placement Workflow (CRITICAL):**
The system enforces a mandatory feasibility check workflow to prevent failed orders:

1. **Feasibility Assessment** - ALWAYS run first using `confirm_order_with_pricing`:
   - Validates image/location availability
   - Checks weather and coverage constraints
   - Calculates accurate pricing with breakdown
   - Assesses confidence level (high/medium/low)
   - Identifies risks and suggests alternatives
   - Verifies authentication and payment readiness

2. **User Review** - Present complete feasibility report including:
   - Feasibility status and confidence level
   - Estimated price and delivery timeline
   - Risks, warnings, and recommendations
   - Alternative options (e.g., archive vs tasking)
   - Coverage details and weather insights

3. **User Confirmation** - Wait for explicit user approval before proceeding

4. **Order Placement** - Only after confirmation, use:
   - `create_satellite_order` for archive imagery
   - `request_satellite_tasking` for new captures

**Automatic Feasibility Checks:**
- `create_satellite_order` validates image availability before placement
- `request_satellite_tasking` validates location, dates, and coverage before submission
- Orders with low confidence or high risks will be rejected with alternatives suggested
- Payment limits and spending thresholds are enforced automatically

**Location & Geocoding Tools:**
11. `geocode_location` - Convert place names to coordinates
12. `reverse_geocode_location` - Convert coordinates to addresses

**AOI Monitoring Tools:**
13. `setup_aoi_monitoring` - Create monitoring for specific areas with webhooks
14. `list_aoi_monitors` - View all configured AOI monitors
15. `update_aoi_monitoring` - Modify AOI monitoring criteria
16. `delete_aoi_monitoring` - Remove AOI monitoring setup

**Webhook Management Tools:**
17. `create_webhook` - Set up webhook notifications for events
18. `list_webhooks` - View all configured webhooks
19. `delete_webhook` - Remove webhook subscriptions
20. `test_webhook` - Test webhook delivery

**Satellite Capabilities & Intelligence:**
21. `get_satellite_capabilities` - Detailed info on available satellites
22. `compare_satellites` - Side-by-side satellite comparison
23. `recommend_satellite` - Get satellite recommendations for use case

**Batch Operations:**
24. `batch_create_orders` - Create multiple orders efficiently

**System Management:**
25. `get_mcp_health` - Comprehensive server health and diagnostics
26. `clear_cache` - Clear server cache for fresh data

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

## Iterative Search & Session Management

### Overview

The system now supports **stateful search sessions** that enable:
- Multi-page result navigation
- Incremental filter refinement  
- Search history tracking
- Context preservation across queries

### Architecture

**Services:**
- `SearchSessionService` - Archive imagery search sessions
- `OrderHistoryService` - Order browsing sessions

**Session Structure:**
```typescript
{
  sessionId: string;           // Unique session identifier
  conversationId: string;      // Associated conversation
  criteria: SearchCriteria;    // Current filters
  pages: CachedPage[];         // Result pages
  history: HistoryEntry[];     // Criteria changes
  lastOffset: number;          // Pagination state
  total?: number;              // Total result count
}
```

### API Endpoints

New REST endpoints for session exploration:
- `GET /mcp/sessions/search/:conversationId` - List search sessions
- `GET /mcp/sessions/search/:conversationId/:sessionId` - Session details
- `GET /mcp/sessions/orders/:conversationId` - List order sessions
- `GET /mcp/sessions/orders/:conversationId/:sessionId` - Order session details

### Session Workflow

```
User: "Show satellite imagery of Tokyo"
  ↓
LLM: geocode_location("Tokyo")
  ↓
LLM: search_satellite_imagery({ location, limit: 10 })
  ↓
Backend: Create session → sessionId: "sess_abc123"
  ↓
Response: { results: [10 items], sessionId, page: { hasMore: true } }

User: "Show next page"
  ↓
LLM: search_satellite_imagery({ sessionId: "sess_abc123", action: "next" })
  ↓
Backend: Use existing session → Fetch next page
  ↓
Response: { results: [10 more items], page: { index: 2, hasMore: true } }

User: "Only show recent images with low cloud cover"
  ↓
LLM: search_satellite_imagery({ 
  sessionId: "sess_abc123", 
  startDate: "2024-11-01",
  maxCloudCoverage: 10 
})
  ↓
Backend: Merge new filters → Reset to page 1
  ↓
Response: { results: [refined results], sessionId, page: { index: 1 } }
```

### Key Features

1. **Pagination Actions**
   - `action: "next"` - Next page
   - `action: "previous"` - Previous page  
   - `action: "first"` - Return to first page
   - `action: "current"` - Re-fetch current page

2. **Filter Refinement**
   - Merge new criteria with existing
   - Automatic pagination reset
   - History tracking of changes

3. **Memory Management**
   - Page caching (max 20 pages per session)
   - Automatic cleanup (24h expiry)
   - Conversation-scoped sessions

4. **History Tracking**
   ```json
   {
     "history": [
       {
         "id": "hist_1",
         "timestamp": 1700000000000,
         "criteria": { "location": {...}, "maxCloudCoverage": 20 },
         "summary": "Location specified; Cloud cover ≤ 20%"
       },
       {
         "id": "hist_2",
         "timestamp": 1700000300000,
         "criteria": { "location": {...}, "maxCloudCoverage": 10 },
         "summary": "Cloud cover ≤ 10%"
       }
     ]
   }
   ```

### LLM Integration

The system prompt guides the LLM to use iterative patterns:

```
User: "Search Tokyo" 
  → Initial search with sessionId

User: "Next page"
  → LLM recognizes context, uses sessionId + action="next"

User: "Fewer clouds"
  → LLM refines existing session with maxCloudCoverage filter
```

### Performance Optimizations

- **Page Caching**: Avoid re-fetching previously viewed pages
- **Session Reuse**: Maintain state across multiple queries
- **Incremental Loading**: Fetch only what's needed
- **Memory Limits**: Cap pages/session to prevent bloat

**Documentation**: See `ITERATIVE_SEARCH_GUIDE.md` for detailed usage patterns.

## Data Flow

### Example: Search for Geospatial Data

```
1. AI Agent → MCP Protocol → "Search for satellite imagery of NYC"
                  ↓
2. MCP Handler → Parse request → Validate
                  ↓
3. API Layer → Authentication → Rate limit check
                  ↓
4. ChatService → Process with LLM + tools
                  ↓
5. ToolExecutor → Execute search_satellite_imagery
                  ↓
6. SearchSessionService → Check for existing session
                  ↓
7. OSMClient → Geocode "NYC" → Get coordinates (if needed)
                  ↓
8. SkyFiClient → Archive search → Get results
                  ↓
9. SearchSessionService → Create/update session → Cache page
                  ↓
10. ToolExecutor → Format results with sessionId
                  ↓
11. ChatService → LLM generates natural language response
                  ↓
12. MCP Handler → Format response → Send to agent
```

## Security Architecture

### Authentication & Payment Validation

#### Real-Time API Key Verification
The system validates SkyFi API keys with actual API calls to ensure credentials are valid:

```typescript
// Authentication validation with real API check
const authResult = await authValidationService.validateUserAuth({
    userId: context?.conversationId,
    conversationId: context?.conversationId,
});

// Returns:
// - authenticated: boolean
// - apiKeyValid: boolean (verified with SkyFi API)
// - hasPaymentMethod: boolean
// - canPlaceOrders: boolean
// - accountStatus: 'active' | 'suspended' | 'payment_required' | 'unknown'
```

#### Multi-Layer Security Checks

**1. API Key Validation** (`AuthValidationService`)
- Verifies API key by attempting lightweight API call (`listOrders`)
- Caches validation results for 5 minutes to avoid excessive API calls
- Provides detailed error messages for authentication failures
- Includes fallback handling for network issues

**2. Payment Method Verification**
- Confirms payment is configured on SkyFi account
- Validates spending limits before order placement
- Provides warnings for high-value orders (>$1,000)
- Requires explicit confirmation for very high-value orders (>$5,000)

**3. Order Placement Protection**
- Two-step confirmation workflow: pricing preview → explicit confirmation
- Validates authentication before processing orders
- Checks payment method availability
- Verifies account status and permissions
- Prevents orders without valid credentials

**4. Spending Limit Management**
```typescript
// Configurable monthly spending limit
MONTHLY_SPENDING_LIMIT=10000  // Default: $10,000/month

// Checks before order placement
const spendingCheck = await authValidationService.checkSpendingLimit(amount, context);
// Returns: withinLimit, currentSpend, limit, remaining
```

#### Authentication Flow

```
User Request → Auth Validation → API Key Check → Payment Verification → Order Processing
     ↓              ↓                  ↓                   ↓                    ↓
  Context      Check Cache      Test with API      Check Account       Execute Order
                     ↓                  ↓                   ↓                    ↓
             Valid? Return      200 OK? Valid      Has Payment?         Track Spending
                     ↓                  ↓                   ↓                    ↓
             Invalid? Retry     401? Invalid      Missing? Reject      Update History
```

#### Security Features

**API Key Management:**
- Stored in environment variables (`SKYFI_API_KEY`)
- Never exposed in logs (only first 8 chars shown)
- Validated on server startup
- Cached validation results to minimize API calls

**Payment Security:**
- Payment verification before order placement
- Spending limit enforcement
- High-value order confirmation workflow
- Transaction history tracking (TODO: database integration)

**Error Handling:**
- Graceful fallback for validation failures
- Clear error messages without exposing sensitive data
- Distinguishes between auth failures and network issues
- Provides actionable guidance for resolution

### Authorization
- Role-based access control (RBAC)
- Resource-level permissions
- Account status verification
- Order placement permissions

### Data Protection
- HTTPS/TLS in transit
- Encrypted sensitive data at rest
- Secure credential storage (environment variables)
- API key masking in logs

### API Security
- Helmet.js security headers
- CORS configuration
- Input validation (Zod)
- SQL injection prevention (parameterized queries)
- XSS protection
- Rate limiting per endpoint

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

## Webhook System Architecture

### Overview

The SkyFi MCP webhook system provides real-time event notifications for orders, tasking, and AOI monitoring. The system consists of three main components:

1. **Webhook Registration** - Register webhooks with SkyFi API
2. **Webhook Receiver** - Receive and process incoming notifications
3. **Event Processing** - Route and handle different event types

### Architecture Diagram

```
┌──────────────┐         ┌─────────────────┐         ┌──────────────┐
│  SkyFi API   │────────>│ Webhook Receiver │────────>│Event Processor│
│              │  POST   │   /webhooks/     │         │              │
└──────────────┘         │   receive/:id    │         └──────┬───────┘
                         └─────────┬─────────┘                │
                                   │                          │
                                   v                          v
                         ┌──────────────────┐      ┌──────────────────┐
                         │ Signature Verify │      │  Event Handlers  │
                         │ (HMAC-SHA256)    │      │  - Orders        │
                         └──────────────────┘      │  - Tasking       │
                                   │               │  - AOI Alerts    │
                                   v               │  - Imagery       │
                         ┌──────────────────┐      └──────────────────┘
                         │    PostgreSQL    │
                         │  - Webhooks      │
                         │  - Notifications │
                         └──────────────────┘
```

### Components

#### 1. Webhook Handler Service

**Location:** `backend/src/services/webhook-handler.service.ts`

**Responsibilities:**
- Verify HMAC-SHA256 signatures from SkyFi
- Process incoming webhook payloads
- Route events to appropriate handlers
- Log notification history to database
- Format payload summaries for logging

**Key Methods:**
```typescript
class WebhookHandlerService {
  verifySignature(payload: string, signature: string, secret: string): boolean;
  processWebhook(webhookId: string, payload: SkyFiWebhookPayload): Promise<void>;
  handleOrderCompleted(payload: SkyFiWebhookPayload): Promise<void>;
  handleAoiDataAvailable(payload: SkyFiWebhookPayload): Promise<void>;
  // ... other event handlers
}
```

#### 2. Webhook Routes

**Location:** `backend/src/api/webhook.routes.ts`

**Endpoints:**
```
POST   /api/v1/webhooks/receive/:webhookId  - Receive webhook from SkyFi
POST   /api/v1/webhooks/skyfi               - Legacy generic endpoint
GET    /api/v1/webhooks/test/:webhookId     - Send test notification
GET    /api/v1/webhooks/health               - Health check
```

#### 3. Database Models

**Location:** `backend/src/models/monitoring.repository.ts`

**Tables:**
- `webhooks` - Webhook configurations
- `notifications` - Notification history and logs
- `aois` - Area of Interest definitions

### Security

#### HMAC Signature Verification

**Algorithm:** HMAC-SHA256  
**Header:** `X-SkyFi-Signature`

**Process:**
1. SkyFi creates HMAC: `HMAC-SHA256(payload, webhook.secret)`
2. Signature sent in HTTP header
3. Server verifies using timing-safe comparison
4. Reject requests with invalid/missing signatures

**Implementation:**
```typescript
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

#### Best Practices

✅ **Enabled:**
- HTTPS-only webhook URLs
- HMAC signature verification
- Webhook secret rotation
- Request rate limiting
- Notification logging
- Error tracking

❌ **Disabled:**
- Plain HTTP webhooks
- Unsigned webhook acceptance
- Credential exposure in logs

### Supported Events

| Event | Description | Payload |
|-------|-------------|---------|
| `order.created` | Order initiated | orderId, status |
| `order.processing` | Order in progress | orderId, status |
| `order.completed` | Order finished | orderId, downloadUrls, metadata |
| `order.failed` | Order error | orderId, error |
| `tasking.scheduled` | Capture scheduled | orderId, captureTime |
| `tasking.captured` | Satellite captured | orderId, captureDate, cloudCover |
| `tasking.failed` | Tasking error | orderId, error |
| `imagery.available` | New imagery | imageId, resolution, cloudCover |
| `aoi.data.available` | AOI alert | aoiId, imageId, cloudCover |
| `aoi.capture.scheduled` | AOI capture | aoiId, captureTime |
| `aoi.capture.completed` | AOI finished | aoiId, downloadUrls |

### Event Processing Flow

```
Webhook Received
      │
      v
  Verify Signature
      │
      ├─ Invalid ──> Return 401
      │
      v
  Validate Webhook ID
      │
      ├─ Not Found ──> Return 404
      │
      v
  Check Active Status
      │
      ├─ Inactive ──> Return 403
      │
      v
  Log to Database
      │
      v
  Route to Handler
      │
      v
  Process Event
      │
      v
  Update Last Sent Time
      │
      v
  Return 200 OK
```

### Integration Examples

#### 1. Create AOI with Webhook

```typescript
const aoi = await monitoringService.createAoi({
  userId: 'user-123',
  name: 'SF Bay Area Monitoring',
  geometry: { type: 'Polygon', coordinates: [...] },
  webhook: {
    url: 'https://your-server.com/api/v1/webhooks/receive/webhook-id',
    events: ['aoi.data.available'],
    secret: 'your-secret-key'
  }
});
```

#### 2. Standalone Webhook

```typescript
const webhook = await skyfiClient.createWebhook({
  url: 'https://your-server.com/webhooks/skyfi',
  events: ['order.completed', 'order.failed'],
  secret: 'your-secret-key'
});
```

### Performance

- **Response Time:** <100ms for webhook receiver
- **Processing:** Async event processing
- **Database:** Indexed webhook lookups
- **Logging:** Notification history with retention policy

### Monitoring

**Metrics:**
- Webhook delivery success rate
- Signature verification failures
- Event processing times
- Notification volume by event type

**Logs:**
```
- Webhook received: event, webhookId, timestamp
- Signature verification: success/failure
- Event processing: handler, duration, result
- Error tracking: failures, retries, alerts
```

### Future Enhancements

- **Retry Logic:** Automatic retry with exponential backoff
- **Delivery Status:** Track delivery attempts and failures
- **Webhook Management UI:** Visual webhook configuration
- **Analytics Dashboard:** Webhook usage statistics
- **Custom Event Filters:** Advanced event routing rules

---

## Configuration Management

### Environment Variables
- `.env` file (development)
- Environment-specific configs
- Secrets management
- Webhook secrets

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

---

---

## 🚀 Recent Improvements (November 2025)

### Enhanced SkyFi MCP Server Capabilities

#### 1. Expanded Tool Coverage

**AOI Monitoring & Webhooks**
- Added comprehensive webhook management tools for real-time event notifications
- Created tools for AOI (Area of Interest) continuous monitoring
- Supports event types: order completion, imagery availability, tasking updates, AOI triggers
- Webhook validation with HTTPS requirement and signature verification support

**New Tool Additions:**
- `create_webhook` - Subscribe to SkyFi platform events
- `list_webhooks` - View all registered webhooks and their status
- `delete_webhook` - Unregister event subscriptions
- `test_webhook` - Verify webhook endpoints before production use
- `setup_aoi_monitoring` - Configure continuous area monitoring
- `list_aoi_monitors` - View active monitoring configurations
- `update_aoi_monitoring` - Modify monitoring criteria and schedules
- `delete_aoi_monitoring` - Stop monitoring and clean up

**Satellite Intelligence:**
- `get_satellite_capabilities` - Detailed satellite specifications and capabilities
- `compare_satellites` - Side-by-side comparison of multiple satellites
- `recommend_satellite` - AI-driven satellite selection based on requirements

#### 2. Satellite Capabilities Database

**Comprehensive Satellite Reference Data:**
- 9 major satellite systems with full specifications
- Commercial satellites: WorldView-2, WorldView-3, Pléiades Neo 3 & 4, SPOT-6
- Public satellites: Sentinel-2A, Sentinel-2B, Landsat 8, Landsat 9

**Detailed Capabilities Include:**
- Resolution specifications (panchromatic, multispectral, SAR)
- Complete spectral band information with wavelengths and descriptions
- Orbital parameters and revisit times
- Swath width and coverage characteristics
- Pricing information (archive and tasking)
- Use case recommendations
- Known limitations and considerations

**Smart Satellite Selection:**
- Filter by resolution range, type, and capabilities
- Recommendations based on use case (agriculture, disaster response, urban planning, etc.)
- Priority-based ranking (resolution, cost, coverage, availability)
- Budget-aware filtering and suggestions

#### 3. Comprehensive Input Validation

**New Validation Module (`validation.ts`):**
- GeoJSON coordinate validation (Point and Polygon geometries)
- Date range validation with sensible defaults and warnings
- Cloud coverage percentage validation (0-100%)
- Resolution validation with cost/availability warnings
- Area size validation with practical thresholds
- Webhook URL validation (HTTPS, public accessibility)

**Parameter-Specific Validation:**
- `validateArchiveSearchParams` - Complete archive search validation
- `validateTaskingParams` - Tasking request validation
- `validateAOIParams` - AOI monitoring configuration validation
- `validateWebhookParams` - Webhook subscription validation

**Validation Features:**
- Clear error messages with actionable feedback
- Warning system for suboptimal but valid inputs
- Coordinate range checking
- Date logic verification
- Cost/availability warnings for extreme values

#### 4. Improved Error Handling & User Feedback

**Enhanced Error Messages:**
- Context-aware error descriptions
- Suggested corrections for common mistakes
- Validation errors with specific field references
- Warnings for edge cases and potential issues

**User-Friendly Feedback:**
- Success messages with relevant details
- Progress indicators for long operations
- Cost estimates before order placement
- Feasibility assessments with alternatives

#### 5. Better Endpoint Discovery

**SkyFi Client Enhancements:**
- Multi-endpoint retry logic for API calls
- Automatic fallback to cached/static data when API unavailable
- Comprehensive logging for debugging
- Rate limiting and timeout handling

**Endpoint Patterns Tried:**
```
/archive/search
/search
/v1/archive/search
/v1/search
/open-data/search
```

**Fallback Strategy:**
- Only activates for server errors, timeouts, and 404s
- Never masks authentication or validation errors
- Clear logging about why fallback is used
- Realistic fallback data for 8 major global cities

#### 6. Tool Execution Improvements

**Enhanced Tool Executor:**
- All new tools fully integrated and implemented
- Consistent error handling across all tools
- Context preservation for conversational flows
- Parallel tool execution support

**Implementation Highlights:**
- Satellite capability lookups with caching
- Dynamic satellite comparison and ranking
- Intelligent webhook management
- AOI monitoring with criteria and scheduling

### Architecture Impact

**Service Layer Enhancements:**
```typescript
// New services added/enhanced:
- satellite-capabilities.ts   // Satellite reference database
- validation.ts               // Input validation utilities
- tool-executor.ts            // Enhanced with 8 new tool handlers
- tool-definitions.ts         // 8 new tool definitions added
```

**Integration Layer Improvements:**
```typescript
// SkyFi integration enhancements:
- Better error classification
- Multi-endpoint failover
- Intelligent fallback system
- Enhanced logging and diagnostics
```

**Data Models:**
```typescript
// New types and interfaces:
- SatelliteCapability       // Satellite specifications
- SpectralBand              // Band information
- ValidationResult          // Validation feedback
- Enhanced webhook types
- Enhanced AOI types
```

### Benefits

1. **Comprehensive Coverage** - 25+ total tools covering all SkyFi capabilities
2. **Better UX** - Clear validation and error messages guide users
3. **Intelligent Selection** - Satellite recommendation engine helps users choose optimal satellites
4. **Reliability** - Multiple fallback mechanisms ensure service availability
5. **Extensibility** - Well-structured validation and capability modules
6. **Production Ready** - Robust error handling and validation

### Testing Recommendations

```bash
# Test new webhook tools
curl -X POST http://localhost:3000/api/mcp/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Create a webhook for order completion events at https://example.com/webhook"
  }'

# Test satellite capabilities
curl -X POST http://localhost:3000/api/mcp/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Compare WorldView-3, Sentinel-2A, and Pléiades Neo 4 satellites"
  }'

# Test satellite recommendations
curl -X POST http://localhost:3000/api/mcp/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Recommend the best satellite for agriculture monitoring with a budget of $500"
  }'

# Test AOI monitoring
curl -X POST http://localhost:3000/api/mcp/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Set up monitoring for downtown San Francisco with webhook notifications"
  }'
```

### Documentation Updates

**New Documentation:**
- [SKYFI_API_STATUS.md](./SKYFI_API_STATUS.md) - Current API status and fallback system
- [SKYFI_API_TROUBLESHOOTING.md](./SKYFI_API_TROUBLESHOOTING.md) - Debugging guide
- [VOICE_ASSISTANT_INTEGRATION.md](./VOICE_ASSISTANT_INTEGRATION.md) - Voice interface docs

**Enhanced Documentation:**
- ARCHITECTURE.md (this file) - Added improvements section
- Tool definitions with better descriptions
- Inline code documentation

### Future Enhancements

**Next Priority Items:**
1. Add webhook retry logic and dead letter queue
2. Implement webhook signature verification
3. Add more satellite systems (SAR, hyperspectral)
4. Enhanced satellite recommendation ML model
5. Webhook event logging and analytics
6. AOI monitoring trigger history
7. Batch operations for webhooks and AOIs
8. Advanced polygon validation (self-intersection, simplification)

### Migration Notes

**No Breaking Changes:**
- All existing tools continue to work
- New tools are additive only
- Backward compatible with existing integrations

**Optional Enhancements:**
- Existing code can benefit from validation utilities
- Consider using satellite capabilities for recommendation features
- Webhook integration can enhance automation workflows
