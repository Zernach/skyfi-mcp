# Conversational Order Placement Flow

## Status: ✅ **FULLY IMPLEMENTED**

## Overview

The SkyFi chat assistant now enforces a mandatory two-step confirmation process for all order placements (both archive and tasking). This ensures users always see the exact price and details before any charges are incurred.

## User Experience Flow

### Step 1: User Expresses Interest
User indicates they want to order imagery:
- "I want to order this image"
- "Can I purchase this?"
- "Order image IMG-12345"
- "Task a satellite for my location"

### Step 2: System Shows Price & Details
System automatically calls `confirm_order_with_pricing` and displays:

**For Archive Orders:**
```
📋 ORDER SUMMARY
• Image ID: IMG-123456
• Price: USD 250.00
• Format: GeoTIFF
• Processing: orthorectified
• Estimated Delivery: 1-2 days

💰 Pricing Breakdown:
• Base cost: $200.00
• Processing fee: $50.00

✅ Ready to order! Would you like me to proceed with this purchase?
Reply "yes", "proceed", or "confirm" to place the order.
```

**For Tasking Orders:**
```
🛰️ TASKING ORDER SUMMARY
• Price: USD 1,200.00
• Estimated Turnaround: 7 days

📊 Feasibility:
• Status: ✅ Feasible
• Confidence: high
• Weather conditions are favorable for capture

🌤️ Weather Risk: low

📦 Archive Alternative: 0 archive images available

✅ Ready to order! Would you like me to proceed with this tasking request?
Reply "yes", "proceed", or "confirm" to place the order.
```

### Step 3: User Confirms
User must explicitly confirm:
- ✅ "yes"
- ✅ "proceed"
- ✅ "confirm"
- ✅ "order it"
- ✅ "go ahead"
- ❌ "maybe" → Assistant asks for clarification
- ❌ "no" → Assistant offers alternatives

### Step 4: Order Placed
Only after explicit confirmation does the system call:
- `create_satellite_order` (for archive)
- `request_satellite_tasking` (for tasking)

User receives:
```
✅ Order placed successfully!
• Order ID: ORD-123456
• Status: processing
• Price: USD 250.00
• Estimated Delivery: 1-2 days

You'll receive an email when your imagery is ready for download.
```

## Technical Architecture

### System Prompt Enforcement

The LLM system prompt includes strict instructions:

```
CRITICAL ORDER PLACEMENT WORKFLOW - ALWAYS FOLLOW:
1. When a user wants to order imagery, NEVER call create_satellite_order directly
2. FIRST call confirm_order_with_pricing to:
   - Validate the order is feasible
   - Calculate exact pricing with breakdown
   - Check authentication and payment method
   - Show all costs and delivery time to the user
3. THEN present the pricing to the user and ask for confirmation
4. ONLY call create_satellite_order AFTER explicit user confirmation
5. If user declines, help them refine their search or explore alternatives
```

### Tool Definitions

**`confirm_order_with_pricing`**
- Pre-order validation tool
- Checks authentication, payment method, spending limits
- Calculates exact pricing with breakdown
- Returns formatted confirmation message
- Does NOT place actual order

**`create_satellite_order`**
- Tool description includes ⚠️ warning
- "ONLY call this tool AFTER calling confirm_order_with_pricing AND receiving explicit user confirmation"
- Actually creates the order and charges the user

**`request_satellite_tasking`**
- Similar ⚠️ warning in description
- Requires confirmation flow via `confirm_order_with_pricing` with `orderType="tasking"`

### Validation & Safety Checks

The `confirm_order_with_pricing` tool performs:

1. **Authentication Validation**
   - Checks SkyFi API key is configured
   - Validates user has payment method on file
   - Confirms account can place orders

2. **Payment Validation**
   - Validates payment amount
   - Checks if amount exceeds high-value threshold ($1000+)
   - Requires extra confirmation for high-value orders

3. **Spending Limit Check**
   - Checks monthly spending limit ($10,000 default)
   - Warns if order would exceed limit
   - Blocks order if limit exceeded

4. **Feasibility Assessment** (Tasking only)
   - Weather risk analysis
   - Archive coverage check
   - Satellite availability
   - Timeline feasibility

5. **Returns Detailed Summary**
   - All pricing details
   - Warnings and risks
   - Recommendations
   - Clear "ready to order" status

## Safety Features

### 🚫 Cannot Skip Confirmation
- System prompt explicitly forbids direct order placement
- Tool descriptions reinforce this requirement
- LLM is instructed to always follow the two-step flow

### 💰 Price Transparency
- All costs shown upfront
- Detailed breakdown provided
- No hidden fees

### ⚠️ Warning System
- High-value orders flagged
- Spending limits enforced
- Payment issues surfaced early
- Feasibility concerns highlighted

### 🔄 User Control
- User can decline at any time
- Can ask for alternatives
- Can modify order parameters
- Can request different imagery

## Error Handling

### No Payment Method
```
❌ Cannot proceed - please resolve the warnings above first.

⚠️ Warnings:
• No payment method on file

Please add a payment method to your SkyFi account before placing orders.
```

### Spending Limit Exceeded
```
⚠️ Order exceeds monthly spending limit.
• Remaining: USD 500.00
• Order cost: USD 1,200.00

Would you like to:
1. Wait until next month
2. Adjust your spending limit
3. Choose a lower-cost option
```

### Infeasible Tasking Request
```
❌ Cannot proceed - please review the warnings and risks above.

⚠️ Warnings:
• High weather risk detected - 80% cloud coverage expected
• Timeline too short - requires 3 days minimum

Alternatives:
• Check archive for existing imagery
• Extend capture window to 7 days
• Request SAR imagery (works in cloudy conditions)
```

## Conversation Examples

### Example 1: Successful Archive Order

```
User: Show me satellite images of Yellowstone National Park
