# Iterative Search & Order Exploration Guide

## Overview

The SkyFi MCP server provides a comprehensive **session management system** with intelligent recommendations and analytics for satellite imagery search and ordering. This system learns from user behavior to provide personalized suggestions and optimize search strategies.

### Key Capabilities

The system enables users to:

- Navigate through paginated results
- Refine search criteria incrementally
- Maintain context across multiple queries
- View search/order history
- Resume previous sessions

## Architecture

### Search Session Management

**Service**: `search-session.service.ts`

Each search creates or continues a session that tracks:
- **Session ID**: Unique identifier for the search session
- **Criteria**: Current search filters (location, date range, cloud cover, etc.)
- **Pages**: Cached result pages with offsets
- **History**: Timeline of criteria changes
- **Context**: Creation time, last update, result counts

### Order History Management

**Service**: `order-history.service.ts`

Similar to search sessions, but for order exploration:
- **Session ID**: Unique identifier for order browsing
- **Filters**: Current filter state (status, dates, satellite, etc.)
- **Pages**: Cached order pages
- **History**: Timeline of filter changes
- **Unique Orders**: Deduplicated order tracking

## API Endpoints

### Search Sessions

#### Get Search Session History
```
GET /api/mcp/sessions/search/:conversationId
```

Returns all search sessions for a conversation:
```json
{
  "success": true,
  "conversationId": "conv_123",
  "sessions": [
    {
      "sessionId": "sess_abc",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:35:00Z",
      "summary": "Location specified; Cloud cover ≤ 20%",
      "resultCount": 45,
      "criteria": {
        "location": { "type": "Point", "coordinates": [-122.4, 37.8] },
        "maxCloudCoverage": 20
      }
    }
  ],
  "total": 1
}
```

#### Get Detailed Search Session
```
GET /api/mcp/sessions/search/:conversationId/:sessionId
```

Returns complete session details including all results:
```json
{
  "success": true,
  "sessionId": "sess_abc",
  "criteria": { ... },
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:35:00Z",
  "pages": 3,
  "totalResults": 45,
  "results": [ ... ],
  "history": [
    {
      "id": "hist_1",
      "timestamp": 1705315800000,
      "criteria": { ... },
      "summary": "Initial search"
    }
  ]
}
```

### Order Sessions

#### Get Order Session History
```
GET /api/mcp/sessions/orders/:conversationId
```

#### Get Detailed Order Session
```
GET /api/mcp/sessions/orders/:conversationId/:sessionId
```

## Tool Usage Patterns

### search_satellite_imagery

The `search_satellite_imagery` tool supports iterative workflows:

#### Initial Search
```javascript
{
  "location": { "type": "Point", "coordinates": [-122.4, 37.8] },
  "startDate": "2024-01-01",
  "maxCloudCoverage": 20,
  "limit": 10
}
```

**Response includes**:
- `sessionId`: For subsequent queries
- `results`: First page of results
- `page`: Pagination metadata (index, hasMore, nextOffset)
- `criteria`: Applied filters

#### Navigate to Next Page
```javascript
{
  "sessionId": "sess_abc",
  "action": "next"
}
```

#### Navigate to Previous Page
```javascript
{
  "sessionId": "sess_abc",
  "action": "previous"
}
```

#### Jump to Specific Page
```javascript
{
  "sessionId": "sess_abc",
  "page": 3  // 1-based page number
}
```

#### Refine Existing Search
```javascript
{
  "sessionId": "sess_abc",
  "maxCloudCoverage": 10,  // More restrictive
  "minResolution": 5        // Add new filter
}
```

This merges new criteria with existing filters and resets pagination to page 1.

#### Use Refinements Object
```javascript
{
  "sessionId": "sess_abc",
  "refinements": {
    "satellites": ["WorldView-3"],
    "startDate": "2024-02-01"
  }
}
```

#### View Search History
```javascript
{
  "sessionId": "sess_abc",
  "action": "current",
  "includeHistory": true
}
```

Returns the current page plus a history array showing all criteria changes.

#### Reset Session
```javascript
{
  "sessionId": "sess_abc",
  "reset": true,
  "location": { "type": "Point", "coordinates": [-118.2, 34.0] }
}
```

Starts a fresh search with new criteria, generating a new session ID.

### list_orders

Similar session-based navigation for order exploration:

#### Initial Query
```javascript
{
  "status": "completed",
  "startDate": "2024-01-01",
  "limit": 20
}
```

#### Navigate Orders
```javascript
{
  "sessionId": "order_sess_xyz",
  "action": "next"
}
```

#### Filter Completed Orders
```javascript
{
  "sessionId": "order_sess_xyz",
  "refinements": {
    "status": "completed",
    "satellite": "WorldView-3"
  }
}
```

## LLM Integration

The system prompt guides the LLM to use iterative workflows:

### Natural Language Examples

**User**: "Show me satellite images of San Francisco from last month"

**LLM**:
1. Calls `geocode_location` → Gets coordinates
2. Calls `search_satellite_imagery` with location, date range
3. Returns results + sessionId

**User**: "Show me the next page"

**LLM**:
1. Calls `search_satellite_imagery` with sessionId + action="next"
2. Returns next page of results

**User**: "Only show images with less than 10% cloud cover"

**LLM**:
1. Calls `search_satellite_imagery` with sessionId + maxCloudCoverage=10
2. Returns refined results (page 1 with new filter)

**User**: "Show me my recent orders"

**LLM**:
1. Calls `list_orders` with status filter or date range
2. Returns orders + sessionId

**User**: "Next page"

**LLM**:
1. Calls `list_orders` with sessionId + action="next"
2. Returns next page of orders

## Frontend Integration

### Recommended UI Components

#### Search History Sidebar
```typescript
// Fetch search sessions
const response = await fetch(`/api/mcp/sessions/search/${conversationId}`);
const { sessions } = await response.json();

// Display as timeline:
sessions.map(s => ({
  time: s.updatedAt,
  summary: s.summary,
  resultCount: s.resultCount,
  onClick: () => resumeSession(s.sessionId)
}))
```

#### Pagination Controls
```typescript
// Show current page and navigation
<div className="pagination">
  <button disabled={!page.previousOffset} onClick={goToPrevious}>
    Previous
  </button>
  <span>Page {page.index}</span>
  <button disabled={!page.hasMore} onClick={goToNext}>
    Next
  </button>
</div>
```

#### Filter Refinement Panel
```typescript
// Allow users to add/modify filters
<FilterPanel>
  <DateRangeFilter onChange={updateDates} />
  <CloudCoverSlider onChange={updateCloudCover} />
  <SatelliteSelect onChange={updateSatellites} />
  <button onClick={applyRefinements}>Apply Filters</button>
</FilterPanel>
```

## Performance Considerations

### Caching Strategy

- **Page Caching**: Previously fetched pages are cached in memory
- **Session Expiry**: Sessions older than 24 hours are cleaned up
- **Memory Limits**: Max 20 pages per session
- **Deduplication**: Order sessions track unique orders across pages

### Optimization Tips

1. **Use sessionId**: Avoids re-fetching already seen data
2. **Limit Results**: Request only what you need (default: 10-20 per page)
3. **Refinement over Reset**: Refining preserves cached pages
4. **History on Demand**: Only request history when needed

## Common Patterns

### Pattern 1: Browse and Refine
```
1. Initial search → Get sessionId
2. Review results
3. Refine criteria → Uses same sessionId
4. Continue pagination with refined results
```

### Pattern 2: Multi-Location Search
```
1. Search Location A → sessionId_A
2. Search Location B → sessionId_B
3. User can switch between sessions
4. Each maintains independent state
```

### Pattern 3: Order Management
```
1. List all orders → orderSessionId
2. Filter by status="completed" → Refines session
3. Paginate through completed orders
4. Access download URLs from results
```

## Error Handling

### Session Not Found
If a sessionId is invalid or expired:
```json
{
  "error": "Session not found or expired"
}
```
**Solution**: Start a new search without sessionId

### Conflicting Parameters
```json
{
  "error": "Cannot use both 'offset' and 'page' parameters"
}
```
**Solution**: Use one pagination method at a time

### Missing Criteria
```json
{
  "error": "Archive search requires at least one search parameter"
}
```
**Solution**: Provide location, AOI, or filters for initial search

## Testing

### Example Test Flows

#### Test Pagination
```bash
# Initial search
curl -X POST /api/mcp/message -d '{
  "method": "search_satellite_imagery",
  "params": {
    "location": { "type": "Point", "coordinates": [-122.4, 37.8] },
    "limit": 5
  }
}'

# Next page
curl -X POST /api/mcp/message -d '{
  "method": "search_satellite_imagery",
  "params": {
    "sessionId": "sess_abc",
    "action": "next"
  }
}'
```

#### Test Refinement
```bash
curl -X POST /api/mcp/message -d '{
  "method": "search_satellite_imagery",
  "params": {
    "sessionId": "sess_abc",
    "maxCloudCoverage": 10,
    "includeHistory": true
  }
}'
```

## Advanced Features

### Intelligent Recommendations

The system now provides **personalized recommendations** based on your search history:

```javascript
// Get recommendations when results are limited
{
  "method": "get_search_recommendations",
  "params": {
    "currentCriteria": { /* your current search */ },
    "includePatterns": true
  }
}
```

**Response includes:**
- Suggestions for refinement (adjust cloud coverage, resolution)
- Similar successful searches from your history
- Alternative satellites you've used successfully
- Recommendations to broaden search if needed

**Automatic recommendations:**
- When search results are < 5 items
- When search returns no results
- Included in search_satellite_imagery responses

### Session Analytics

Track your search behavior and optimize future queries:

```javascript
{
  "method": "get_session_analytics",
  "params": {
    "includePatterns": true,
    "patternLimit": 10
  }
}
```

**Analytics include:**
- Total searches and orders
- Search success rate (% of searches with results)
- Most searched locations
- Preferred satellites
- Average cloud coverage and resolution thresholds
- Recent search patterns with success rates

### Session Comparison

Compare two searches to understand what works best:

```javascript
{
  "method": "compare_search_sessions",
  "params": {
    "sessionId1": "sess_abc",
    "sessionId2": "sess_xyz",
    "highlightDifferences": true
  }
}
```

**Comparison provides:**
- Side-by-side criteria differences
- Result count comparison
- Recommendations for optimal parameters
- Insights on why one search performed better

### Export Session History

Download your complete search and order history:

```javascript
{
  "method": "export_session_history",
  "params": {
    "format": "json" // or "summary"
  }
}
```

**Export includes:**
- All search sessions with full results
- All order sessions
- Search patterns and analytics
- Downloadable JSON file

### REST API Endpoints

Direct HTTP access to session features:

#### Get Recommendations
```
GET /mcp/recommendations/:conversationId
GET /mcp/recommendations/:conversationId?criteria={...}
```

#### Get Analytics
```
GET /mcp/analytics/:conversationId
```

#### Get Patterns
```
GET /mcp/patterns/:conversationId?limit=10
```

#### Compare Sessions
```
POST /mcp/sessions/compare
Body: {
  "conversationId": "conv_123",
  "sessionId1": "sess_abc",
  "sessionId2": "sess_xyz"
}
```

#### Export History
```
GET /mcp/export/:conversationId
```

## Use Cases

### Scenario 1: First-Time User Exploration
1. User searches but finds no results
2. System provides default recommendations
3. User tries suggested popular locations
4. Patterns begin building for personalized suggestions

### Scenario 2: Iterative Refinement
1. User searches with broad criteria → 100 results
2. User refines to reduce cloud coverage → 45 results
3. User refines to specific satellite → 12 results
4. System tracks successful pattern
5. Future searches auto-suggest these refined filters

### Scenario 3: Learning from History
1. User performs many searches over time
2. User asks "What have I been looking for?"
3. System shows analytics: preferred satellites, locations, filters
4. User optimizes future searches based on patterns

### Scenario 4: Troubleshooting
1. User: "This search isn't working well"
2. System provides recommendations based on successful past searches
3. User: "What worked before?"
4. System shows analytics and suggests proven parameters

### Scenario 5: Team Collaboration
1. Team member exports session history
2. Shares with colleague (JSON file)
3. Colleague imports and learns from successful patterns
4. Team optimizes search strategies together

## Future Enhancements

### Planned Features

1. **Persistent Sessions**: Store sessions in database for cross-restart persistence ✅ (In Memory)
2. **Search Templates**: Save and reuse common filter combinations
3. **Shared Sessions**: Allow multiple users to collaborate on searches
4. **Machine Learning**: Predict optimal search parameters
5. **A/B Testing**: Compare different search strategies
6. **Scheduled Searches**: Automate recurring search patterns

### Recently Added Features

✅ **Smart Recommendations** - Context-aware suggestions based on history  
✅ **Session Analytics** - Comprehensive usage tracking and insights  
✅ **Session Comparison** - Side-by-side analysis of searches  
✅ **Export Functionality** - Download complete session history  
✅ **Pattern Recognition** - Automatic detection of successful searches  

### Feedback Welcome

This is an evolving feature. User feedback helps prioritize improvements!

---

**Version**: 2.0.0  
**Last Updated**: 2025-01-15  
**Maintainer**: SkyFi MCP Team

