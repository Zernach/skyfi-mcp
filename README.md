# SkyFi MCP - Model Context Protocol Server

AI-driven geospatial data platform enabling autonomous agents to interact with SkyFi's satellite imagery and data services.

## 🚀 New: LLM Tool-Calling System

**Natural language interface for satellite imagery!** Send text queries, and the system automatically:
- 🧠 Understands your intent using GPT-4
- 🔧 Calls the right SkyFi API tools
- 📡 Executes searches, orders, and tasking requests
- 💬 Returns intelligent, conversational responses

```bash
# Example: Natural language query
./test_chat.sh "Find high-resolution satellite images of Tokyo from last week"

# Response includes: geocoding, archive search, and formatted results
```

**8 Available Tools**: satellite search, ordering, tasking, pricing, status tracking, and geocoding.

See [Tool-Calling System Documentation](docs/TOOL_CALLING_SYSTEM.md) for full details.

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

- **[Tool-Calling System](docs/TOOL_CALLING_SYSTEM.md)** - Natural language interface guide
- [AWS Deployment (Terraform)](terraform/README.md) - Production deployment
- [Development Guide](docs/DEVELOPMENT.md) - Local development setup
- [Architecture](docs/ARCHITECTURE.md) - System architecture overview
- [Product Requirements](docs/PRD.md) - Original PRD

## License

MIT