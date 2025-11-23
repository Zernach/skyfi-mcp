# SkyFi MCP - Model Context Protocol Server

**Version 2.0.0** - Production-ready AI-driven geospatial data platform enabling autonomous agents to interact with SkyFi's satellite imagery and data services.

## 🎉 What's New in v2.0.0

### Major Features Added

✅ **🔐 Real-Time API Key Verification** - Live validation with SkyFi API, caching, and comprehensive error handling  
✅ **💳 Payment Validation & Protection** - Pre-order authentication, spending limits, and two-step confirmation workflow  
✅ **Order Confirmation with Price Validation** - Pre-order feasibility checks and detailed pricing breakdown  
✅ **AOI Monitoring** - Set up area monitoring with webhook notifications for new data  
✅ **Enhanced Feasibility Analysis** - Detailed risk assessment with alternative recommendations  
✅ **Pricing Exploration** - Compare archive vs tasking pricing scenarios side-by-side  
✅ **✨ Iterative Search Sessions** - Stateful search with pagination, refinement, and history tracking  
✅ **✨ Order History Exploration** - Session-based order browsing with filtering and navigation

**17 Available Tools** (up from 11) - See [SKYFI_MCP_IMPROVEMENTS.md](docs/SKYFI_MCP_IMPROVEMENTS.md) for complete details.

### 🔒 Security & Authentication Highlights

✅ **Multi-layer security checks** before every order  
✅ **Real API calls** to validate credentials (not just config checks)  
✅ **Caching** to prevent excessive API usage (5min TTL)  
✅ **Spending limit enforcement** with configurable thresholds  
✅ **High-value order detection** ($1,000+) with mandatory confirmation  
✅ **Two-step workflow**: pricing preview → user confirmation → order placement  
✅ **Graceful error handling** with actionable messages

See [docs/AUTHENTICATION_AND_PAYMENT.md](docs/AUTHENTICATION_AND_PAYMENT.md) for complete security documentation.

## 🚀 LLM Tool-Calling System

**Natural language interface for satellite imagery!** Send text queries, and the system automatically:
- 🧠 Understands your intent using GPT-4
- 🔧 Calls the right SkyFi API tools
- 📡 Executes searches, orders, tasking, and monitoring
- 💰 Validates pricing and payment before orders
- 🔔 Sets up notifications via webhooks
- 💬 Returns intelligent, conversational responses

```bash
# Example: Search and order with price confirmation
./test_chat.sh "Find satellite images of Tokyo and confirm pricing for the best one"

# Example: Iterative search with pagination
./test_chat.sh "Find satellite images of San Francisco from last month"
./test_chat.sh "Show me the next page"
./test_chat.sh "Only show images with less than 10% cloud cover"

# Example: Set up monitoring
./test_chat.sh "Set up daily monitoring for wildfires in Northern California with webhook at https://my-server.com/webhook"

# Example: Explore pricing options
./test_chat.sh "Compare archive vs tasking pricing for 50 sq km area in Paris"

# Example: Order history exploration
./test_chat.sh "Show me my completed orders"
./test_chat.sh "Next page"
```

See [SKYFI_MCP_IMPROVEMENTS.md](docs/SKYFI_MCP_IMPROVEMENTS.md) for comprehensive documentation.

## 🎉 Epic 1 Complete!

✅ **Foundation & Core Infrastructure** (34/34 points)
- MCP Protocol (JSON-RPC 2.0) with HTTP + SSE support
- SkyFi API Client with retry, rate limiting, and caching
- PostgreSQL database with connection pooling
- OpenStreetMap geocoding integration
- Docker containerization with Docker Compose
- Comprehensive testing suite
- CI/CD pipeline with GitHub Actions
- **NEW**: LLM tool-calling system with OpenAI integration

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set SKYFI_API_KEY, OPENAI_API_KEY, POSTGRES_PASSWORD, JWT_SECRET

# Start with Docker
npm run docker:up

# Verify
curl http://localhost:3000/health

# Test the chat system
./test_chat.sh "Find satellite images of Paris"
```

## AWS Deployment

Complete Terraform infrastructure for production deployment:

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit with your SkyFi API key and settings
./deploy.sh all
```

See [terraform/README.md](terraform/README.md) for detailed AWS deployment guide.

## Documentation

### Core Documentation
- **[🆕 SkyFi MCP Improvements](docs/SKYFI_MCP_IMPROVEMENTS.md)** - **NEW** Complete v2.0 features guide
- **[Tool-Calling System](docs/TOOL_CALLING_SYSTEM.md)** - Natural language interface guide
- **[✨ Iterative Search Guide](docs/ITERATIVE_SEARCH_GUIDE.md)** - **NEW** Session-based search and exploration
- [Architecture](docs/ARCHITECTURE.md) - System architecture overview
- [AWS Deployment (Terraform)](terraform/README.md) - Production deployment
- [Development Guide](docs/DEVELOPMENT.md) - Local development setup

### Feature Documentation
- [Voice Assistant Integration](docs/VOICE_ASSISTANT_INTEGRATION.md) - OpenAI Realtime API integration
- [SkyFi API Status](docs/SKYFI_API_STATUS.md) - Current API status and fallback system
- [Product Requirements](docs/PRD.md) - Original PRD

## License

MIT