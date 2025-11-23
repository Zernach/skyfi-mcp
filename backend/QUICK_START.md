# SkyFi MCP Backend - Quick Start Guide

## 🚀 Quick Deploy

```bash
# 1. Navigate to backend
cd /Users/zernach/code/skyfi-mcp/backend

# 2. Install dependencies
npm ci

# 3. Build TypeScript
npm run build

# 4. Start server
npm start
```

## ✅ Health Check

```bash
# Check server is running
curl http://localhost:3000/health

# Check MCP status
curl http://localhost:3000/mcp/status

# Test chat endpoint
curl -X POST http://localhost:3000/mcp/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "chat",
    "params": {"message": "Hello"},
    "id": 1
  }'
```

## 🔑 Required Environment Variables

```bash
# Required for chat functionality
export OPENAI_API_KEY="sk-..."

# Required for SkyFi API access (optional - uses fallback data)
export SKYFI_API_KEY="..."

# Optional
export PORT=3000
export NODE_ENV=production
export SKYFI_BASE_URL="https://api.skyfi.com"
```

## 📊 Recent Improvements (Nov 23, 2025)

### Phase 1: Core Stability
- ✅ Fixed OpenAI function schema errors
- ✅ Added input validation
- ✅ Implemented timeout protection
- ✅ Enhanced error handling with retry logic

### Phase 2: Advanced Stabilization
- ✅ Conversation locking (prevents race conditions)
- ✅ Request deduplication (saves API costs)
- ✅ Cancellable retries
- ✅ Improved system prompt
- ✅ Memory-safe conversation handling

## 📖 Documentation

- `docs/CHAT_STABILITY_IMPROVEMENTS.md` - Phase 1 improvements
- `docs/CHAT_STABILIZATION_V2.md` - Phase 2 improvements
- `docs/DEPLOYMENT_CHECKLIST.md` - Full deployment guide
- `docs/ARCHITECTURE.md` - System architecture

## 🐛 Troubleshooting

### Build Errors
```bash
# Clean and rebuild
rm -rf dist/
npm run build
```

### API Errors
```bash
# Check logs
tail -f logs/error.log

# Verify API keys
echo $OPENAI_API_KEY | head -c 20
```

### Memory Issues
```bash
# Check conversation stats (add to monitoring endpoint)
# Monitor with: htop, pm2 status, etc
```

## 🧪 Quick Tests

### Test Chat
```bash
./test_chat.sh
```

### Test SSE Streaming
```bash
./test_sse.sh
```

### Test MCP Protocol
```bash
./test_mcp.sh
```

## 📝 Logs

```bash
# Application logs
tail -f logs/app.log

# Error logs only
tail -f logs/error.log

# Startup logs
cat logs/startup.log
```

## 🔄 Restart Server

```bash
# If using PM2
pm2 restart skyfi-mcp

# If using Docker
docker restart skyfi-mcp

# Direct run
npm start
```

## ⚡ Performance Tips

1. **Conversation Cleanup**: Runs hourly, removes 24h+ old conversations
2. **Request Deduplication**: Identical requests share same response
3. **Retry Logic**: Max 2 retries with exponential backoff
4. **Timeout**: 2-minute max per request
5. **Message Limit**: 20 messages per conversation

## 🚨 Common Issues

| Issue | Solution |
|-------|----------|
| "OPENAI_API_KEY not configured" | Set environment variable |
| "Invalid function schema" | Rebuild: `npm run build` |
| "Request timeout" | Check OpenAI API status |
| "Conversation not found" | Cleared by cleanup or timeout |
| TypeScript errors | Run `npm run build` to see details |

## 📚 Next Steps

1. Review documentation in `docs/` folder
2. Check `terraform/` for AWS deployment
3. Test with frontend: `cd ../frontend && npm start`
4. Monitor logs for errors
5. Set up proper monitoring (Prometheus, Grafana, etc.)

## 🎯 Production Checklist

- [ ] Environment variables set
- [ ] Build successful (`npm run build`)
- [ ] Health check passes
- [ ] Chat endpoint works
- [ ] Logs directory exists
- [ ] Process manager configured (PM2/systemd)
- [ ] Monitoring set up
- [ ] Backup strategy defined

## 💡 Tips

- Use `conversationId` to maintain context across requests
- Always call `confirm_order_with_pricing` before `create_satellite_order`
- Archive search is cheaper/faster than tasking
- Clear old conversations periodically
- Monitor memory usage in production

---

**Last Updated**: November 23, 2025
**Status**: ✅ Production Ready
**Build**: Passing


