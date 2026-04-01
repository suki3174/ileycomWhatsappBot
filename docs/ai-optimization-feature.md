## AI Product Optimization Feature

This document explains the AI optimization feature for the ileycom WhatsApp bot. After a product is created, the system automatically sends it to an external AI service for optimization, which can enhance product descriptions, suggest tags, and improve product metadata.

---

## Architecture Overview

### Components

1. **AI Optimization Service** (`src/services/ai_optimization_service.ts`)
   - Manages calls to external AI endpoint
   - Handles async optimization requests
   - Stores optimization state and results

2. **AI Cache** (`src/repositories/ai_optimization/ai_optimization_cache.ts`)
   - In-memory cache for optimization states
   - 24-hour TTL (configurable)
   - Tracks pending, processing, completed, and failed states

3. **genAI Endpoint** (`src/app/api/seller/optimizedProductFlow/genAI_endpoint/route.ts`)
   - Internal API to trigger AI optimization
   - POST: Trigger optimization for a product
   - GET: Check optimization status

4. **Optimized Product Handler** (`src/handlers/seller/optimizedProduct_handler.ts`)
   - Displays AI optimization results to user
   - Shows loading state while AI processes
   - Allows user to accept or reject optimizations

5. **Add Product Flow Handler** (modified)
   - Now triggers AI optimization after successful product creation
   - Sends product data to genAI endpoint

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User completes add product flow and submits              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │ Product created       │
         │ Product ID returned   │
         └────────┬──────────────┘
                  │
                  ▼ (Fire & Forget - Non-Blocking)
    ┌─────────────────────────────────┐
    │ Trigger AI optimization         │
    │ POST /genAI_endpoint            │
    │ Send: { productId: "12345" }    │
    │ Returns: 202 Accepted           │
    └────────┬────────────────────────┘
             │
             │ (Non-blocking - user flow continues)
             │
         ┌───┴─────────────────────────┐
         │ Product added to catalog    │
         │ User returns to menu        │
         └─────────────────────────────┘
             
             (Async Processing Continues in Background)
                     │
                     ▼
   ┌──────────────────────────────┐
   │ AI Service receives request  │
   │ Fetches product details      │
   │ from your backend API        │
   └──────────────────────────────┘
             │
             ▼
   ┌──────────────────────────────┐
   │ AI processes product:        │
   │ - Optimize name              │
   │ - Generate descriptions      │
   │ - Suggest tags & categories  │
   └──────────────────────────────┘
             │
             ▼
   ┌──────────────────────────────┐
   │ AI returns results to bot    │
   │ Cache updated: COMPLETED     │
   └──────────────────────────────┘
             │
             ▼
  ┌────────────────────────────────┐
  │ User later views optimizations │
  │ or AI sends notification       │
  │ optimizedProductFlow triggered │
  └────────────────────────────────┘
```

---

## Configuration

Set these environment variables in your `.env.local` or deployment config:

```env
# External AI service endpoint
# The AI service will receive { productId: "..." } and should fetch
# full product details from your backend API using the productId
AI_SERVICE_URL=https://your-ai-service.com/api/optimize

# Timeout for AI service requests (milliseconds)
AI_SERVICE_TIMEOUT_MS=30000

# API key for authentication with AI service
AI_SERVICE_API_KEY=your-api-key-here
```

---

## API Endpoints

### 1. Trigger AI Optimization

**Endpoint:** `POST /api/seller/optimizedProductFlow/genAI_endpoint`

**Request:**
```json
{
  "productId": "12345"
}
```

**Response (202 Accepted - Fire & Forget):**
```json
{
  "success": true,
  "status": "processing",
  "productId": "12345",
  "message": "Product optimization processing",
  "requestedAt": 1711900000000
}
```

The endpoint returns immediately and the AI processing happens asynchronously in the background.

---

### 2. Check Optimization Status

**Endpoint:** `GET /api/seller/optimizedProductFlow/genAI_endpoint?productId=12345`

**Response (when pending/processing):**
```json
{
  "status": "processing",
  "productId": "12345",
  "requestedAt": 1711900000000,
  "completedAt": null
}
```

**Response (when completed):**
```json
{
  "status": "completed",
  "productId": "12345",
  "requestedAt": 1711900000000,
  "completedAt": 1711900015000,
  "result": {
    "productId": "12345",
    "optimizedName": "Sucre Raffiné en Cubes Premium",
    "optimizedShortDescription": "Sucre premium 100% pur, cristaux réguliers",
    "optimizedFullDescription": "Description optimisée plus détaillée...",
    "suggestedTags": ["sucre", "premium", "cuisine", "natural"],
    "suggestedCategories": ["Alimentaire", "Epicerie", "Produits Naturels"],
    "confidence": 0.92,
    "processingTimeMs": 3150
  }
}
```

---

## External AI Service Contract

Your AI service should implement this interface:

**URL:** Must be configured via `AI_SERVICE_URL` env variable

**Method:** POST

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer {AI_SERVICE_API_KEY}  (if API key is configured)
```

**Request Body:**
```json
{
  "productId": "12345"
}
```

The AI service receives **only the product ID**. It should:
1. Use this `productId` to fetch full product details from your backend API
2. Process the product data (name, descriptions, category, etc.)
3. Return optimized results

**Example: AI Service should call your backend**
```
GET /api/products/12345
Returns:
{
  "id": "12345",
  "name": "Sucre en cubes",
  "shortDescription": "...",
  "fullDescription": "...",
  "category": "Alimentaire",
  "subcategory": "Epicerie"
}
```

**Response:**
```json
{
  "productId": "12345",
  "optimizedName": "string (optional)",
  "optimizedShortDescription": "string (optional)",
  "optimizedFullDescription": "string (optional)",
  "suggestedTags": ["string"],
  "suggestedCategories": ["string"],
  "confidence": "number (0-1, optional)",
  "processingTimeMs": "number (optional)"
}
```

**Requirements:**
- Must accept JSON POST requests with `productId`
- Must return JSON responses
- All fields in response are optional (nulls are safe)
- Processing is asynchronous - can take time to complete
- Should aim to complete within `AI_SERVICE_TIMEOUT_MS` (default 30 seconds)
- Fetch product details from your backend using the provided `productId`

---

## Usage Flow in WhatsApp

### Step 1: Add Product

User completes the add product flow:
- Uploads product image
- Enters product name, category, pricing, etc.
- Submits form

### Step 2: Product Created & AI Triggered (Non-Blocking)

- Product is saved to database
- Product ID is returned
- **AI optimization is triggered asynchronously** by sending only the product ID
- Return value: 202 Accepted (fire & forget)
- **User is immediately returned to main menu** - no waiting for AI
- AI processes in background while user continues using bot

### Step 3: AI Processing (Background)

Meanwhile, the AI service:
1. Receives: `{ productId: "12345" }`
2. Fetches: Full product details from your backend API using the product ID
3. Processes: Optimizes name, descriptions, generates tags, etc.
4. Caches: Results stored in optimization cache when completed
5. Status: COMPLETED

### Step 4: View AI Optimization (Optional, User-Initiated)

User can later request to view optimization results:
- Click button in menu: "View AI Optimization"
- Optimization flow displays:
  - Loading state (if AI still processing: status = PENDING or PROCESSING)
  - Optimization results (if completed: status = COMPLETED)
  - Error message (if failed: status = FAILED)

### Step 5: Accept or Reject

User can:
- **Accept optimizations**: Updates product with new name, descriptions, tags
- **Reject optimizations**: Keeps product as originally created

---

## Implementation Details

### Add Product Handler Changes

After successful product creation in `handleSubmitSummary`:

```typescript
// Product is created successfully
const createResult = await persistDraftProduct(token, current, quantity);

// Trigger AI optimization (non-blocking, fire & forget)
// Only send the product ID - AI will fetch full details from your backend
const aiResponse = await fetch(`${baseUrl}/api/seller/optimizedProductFlow/genAI_endpoint`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ productId: createResult.productId }),
});

// Returns immediately with 202 Accepted
// AI processing continues in background
```

**Key Points:**
- Only `productId` is sent to the AI service
- Request returns immediately (202 Accepted)
- Doesn't block user from continuing in the bot
- AI service should fetch full product details using the productId

### Optimization States

**PENDING**: Initial state, optimization not yet submitted
**PROCESSING**: Submitted to AI service, waiting for completion
**COMPLETED**: AI returned results successfully
**FAILED**: AI service error or timeout

---

## Error Handling

### AI Service Unreachable
- Initial product creation still succeeds
- Optimization marked as FAILED
- User gets error message in optimization flow
- Can manually retry optimization later

### Timeout
- Request times out after `AI_SERVICE_TIMEOUT_MS` (default 30s)
- Product creation not affected
- Optimization marked as FAILED
- User can retry

### Invalid Response
- If AI returns invalid data, optimization still completes
- Empty/null fields are ignored gracefully

---

## Monitoring & Debugging

### Check Cache Statistics
```typescript
import { getOptimizationCacheStats } from "@/repositories/ai_optimization/ai_optimization_cache";

const stats = getOptimizationCacheStats();
console.log(stats);
// { totalEntries: 5, maxTTLMs: 86400000 }
```

### Enable Detailed Logging
Check server logs for:
- `[AI Service]` - optimization service events
- `[AI Cache]` - cache operations
- `[genAI_endpoint]` - endpoint calls
- `[optimizedProduct_handler]` - handler flow

---

## Future Enhancements

1. **Database Persistence**: Move optimization states to database (Redis or SQL)
2. **Webhook Callbacks**: External AI service can notify bot when ready
3. **Batch Processing**: Queue multiple products for optimization
4. **Analytics**: Track which optimizations users accept/reject
5. **Rate Limiting**: Prevent abuse of AI endpoint
6. **Product Updates**: Auto-apply accepted optimizations to product

---

## Troubleshooting

### Optimization not triggering
- Check `AI_SERVICE_URL` is configured
- Check server logs for errors in `handleSubmitSummary`
- Verify genAI endpoint is accessible
- Check network connectivity to your AI service

### Always shows "loading"
- Check if AI service is responding
- Verify `AI_SERVICE_API_KEY` if required
- Check timeout setting (may be too short)
- Review logs for AI service errors

### Cache not clearing
- Cache has 24-hour TTL (configurable in code)
- Manual clear via `clearOptimizationState(productId)`
- Or restart application for fresh cache

---

## Models & Types

See `src/models/ai_optimization_model.ts` for:
- `AIOptimizationRequest` - Request to AI service
- `AIOptimizationResponse` - Response from AI service
- `OptimizationStatus` - Enum of possible states
- `OptimizationState` - Internal tracking state
