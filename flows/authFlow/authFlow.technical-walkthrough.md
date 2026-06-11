# Auth Flow Technical Walkthrough

## Purpose
This document explains how the Auth Flow was developed and how it runs end-to-end in production.
It covers:
- Architecture and boundaries
- Technical glossary (core terms used by this flow)
- Meta encrypted callback processing (decryption and encryption)
- Signup phases and screen transitions
- Plugin endpoints hit by each phase
- Failure and retry behavior

## System Boundaries
- WhatsApp Cloud API (Meta Graph): message template send and flow transport
- Next.js API routes: application entry points for send and encrypted callbacks
- Auth handler and service layer: business decisions and state transitions
- WordPress plugin API: source of seller truth and persistent auth state
- Redis cache (optional): short-term session acceleration and dedupe helpers

## Main Entry Points
- Send endpoint: src/app/api/seller/authFlow/send/route.ts
- Encrypted callback endpoint: src/app/api/seller/authFlow/meta_endpoint/route.ts
- Flow state machine handler: src/handlers/seller/auth_flowHandler.ts
- Auth service orchestration: src/services/auth_service.ts
- Plugin repository boundary: src/repositories/auth/seller_repo.ts

## Glossary (Technical Terms)
- Auth Flow: The WhatsApp interactive authentication journey (WELCOME, SIGN_UP, SIGN_IN, FORGOT_PASSWORD, SUCCESS).
- Flow Token: A generated token shaped like flowtoken-{phone}-{timestamp}. It binds a user interaction to seller context.
- DATA_EXCHANGE: Meta callback action containing a screen event and user-submitted data.
- Ping: Meta health or liveness callback action used to validate endpoint responsiveness.
- State Insert / Upsert: Create-or-update operation on seller state, usually at plugin endpoint /seller/state/insert.
- Seller State: Persistent auth/session row (phone, flow_token, code, session fields) used for flow decisions.
- Fast Path: Preferred low-latency path (for example direct code update first during signup).
- Fallback Path: Secondary path used when fast path fails (for example prepare state then retry update).
- Cache Hit / Miss: Whether seller snapshot exists in Redis for requested key.
- Token-First Lookup: Seller lookup starts by flow token before phone fallback.
- Read-After-Write Check: Validation step that re-reads persisted state after update if response is inconclusive.
- Retry: Controlled second attempt for transient timeout/error behavior.
- Timeout Budget: Max wait time for an external dependency before short-circuiting.
- OAEP: RSA padding scheme used to decrypt AES key from Meta request.
- AES-GCM: Symmetric authenticated encryption mode used for request/response payload confidentiality and integrity.
- IV (Initialization Vector): Non-secret nonce used in AES mode; must have expected byte length.
- Auth Tag: Integrity tag emitted by GCM mode and validated on decrypt.
- 421 Response: Used when request decryption fails so Meta can refresh key material.
- 409 Response: Used by send endpoint when seller state was not confirmed ready.

## Development Story (How This Flow Was Built)

### Phase 1: Basic Send + Callback Wiring
The team first wired a send route to dispatch a WhatsApp template containing a flow button and a flow token.
Then a dedicated callback route was added to receive Meta encrypted flow requests and return encrypted responses.

### Phase 2: Crypto Compliance
The callback route was upgraded to:
- Decrypt request body with RSA OAEP (sha256) to recover AES key
- Decrypt payload with AES-128-GCM
- Route ping vs data_exchange actions
- Re-encrypt responses with the same key context
When decryption fails, route returns HTTP 421.

### Phase 3: Seller-State Driven Routing
WELCOME logic was moved to state-table lookup by phone, so screen routing depends on persisted seller state.
If seller has code, route to SIGN_IN; otherwise route to SIGN_UP.

### Phase 4: Signup Reliability
SIGN_UP was changed to update code first (fast path), then prepare state and retry if update fails.
This reduced unnecessary pre-work while still handling first-time state races.

### Phase 5: Hard Gate Before Send
To prevent users opening auth flow before state exists, send route now blocks on prepareSellerState.
If state is not confirmed, template is not sent and endpoint returns 409.

## Meta Encryption / Decryption Flow (Detailed)

### Incoming encrypted request
Meta sends body fields:
- encrypted_flow_data
- encrypted_aes_key
- initial_vector

### Server decrypt process
1. Read private key from PRIVATE_KEY_PATH.
2. Decrypt encrypted_aes_key with RSA OAEP (sha256) to get 16-byte AES key.
3. Decode initial_vector and validate 16-byte length.
4. Decode encrypted_flow_data, split ciphertext and 16-byte GCM auth tag.
5. Decrypt ciphertext with AES-128-GCM and parse JSON.

### Action dispatch
- If action is ping: return { data: { status: "active" } }.
- Otherwise: forward parsed request to handleAuthFlow and get screen/data response.

### Outgoing encrypted response
1. Apply Meta-compatible IV transform used by current implementation.
2. Encrypt JSON response with AES-128-GCM.
3. Append GCM tag.
4. Return base64 payload as text/plain.

## Signup Runtime Phases (Screen-by-Screen)

### Phase A: Send Template
File: src/app/api/seller/authFlow/send/route.ts
1. Validate input seller and recipient phone.
2. Perform short best-effort seller lookup.
3. Reuse persisted token if phone matches, else generate new token.
4. Hard gate: await prepareSellerState(token).
5. If state not ready, return 409 and do not send template.
6. If ready, send Meta template auth_flow_local with flow button.

Plugin endpoints hit in this phase:
- /seller/by-phone (best-effort lookup)
- /seller/state/insert (prepare state)

### Phase B: Callback Ping
File: src/app/api/seller/authFlow/meta_endpoint/route.ts
1. Decrypt request.
2. If action ping, return active status encrypted.

Plugin endpoints hit in this phase:
- None

### Phase C: WELCOME -> SIGN_UP or SIGN_IN
File: src/handlers/seller/auth_flowHandler.ts, handleWelcome
1. Extract token and phone.
2. Validate supported phone market.
3. Lookup seller state by phone.
4. If code exists, return SIGN_IN; else return SIGN_UP.

Plugin endpoints hit in this phase:
- /seller/state/by-phone

### Phase D: SIGN_UP (Primary)
File: src/handlers/seller/auth_flowHandler.ts, handleSignUp
1. Validate token exists.
2. Validate PIN strength and confirm PIN match.
3. Validate supported phone.
4. Attempt setSellerCode(token, pin) first.
5. If update fails: prepareSellerState(token), retry once if needed, then retry setSellerCode.
6. On success, return SIGN_IN.

Plugin endpoints hit in this phase (fast path + fallback paths):
- /seller/update-code (first attempt)
- /seller/by-flow-token (read-after-write or lookup fallback path)
- /seller/state/insert (if fallback needed)
- /seller/by-phone (fallback if state insert timeout/failure in repository fallback)
- /seller/state/by-phone (fallback when insert response shape is empty but write likely succeeded)

### Phase E: SIGN_IN (Post-signup login)
File: src/handlers/seller/auth_flowHandler.ts, handleSignIn
1. Validate phone and PIN.
2. Transition to SUCCESS.
3. Start session activation and menu send asynchronously.

Plugin endpoints hit in this phase:
- /seller/session/activate
- /seller/by-flow-token (refresh after activation)

## Plugin Endpoint Catalog (Auth Scope)
- /seller/by-phone
  - Resolve seller by phone.
  - Used during send pre-lookup and some fallback paths.

- /seller/state/insert
  - Upsert seller state (phone, flow_token, optional fields).
  - Used as mandatory readiness gate before template send and signup fallback recovery.

- /seller/state/by-phone
  - Read seller state directly by phone from state table path.
  - Used by WELCOME and insert-recovery path.

- /seller/by-flow-token
  - Resolve seller using flow token.
  - Used for token-first auth and consistency checks.

- /seller/update-code
  - Persist seller code (hashed PIN).
  - Primary write in signup.

- /seller/session/activate
  - Set session validity window after successful sign-in.

- /seller/reset-token/set
  - Used by forgot/reset flow to persist reset token metadata.

- /seller/session/pre-expiry-auth-pending
  - Used by resendExpiredSessions route to find near-expiry sessions.

- /seller/session/mark-auth-portal-sent
  - Marks reminder/auth portal dispatch as sent for current window.

## Reliability and Error Mapping
- Decryption failure in callback endpoint -> 421
- Missing or invalid callback payload structure -> 400
- Unexpected callback processing failure -> 500
- State not ready during send gating -> 409
- External dependency delays handled with bounded timeouts and selective retries

## Why This Design Works
- Security: Meta payload confidentiality and integrity through RSA + AES-GCM.
- Correctness: token-bound routing with deterministic screen transitions.
- Operational safety: hard send gating avoids opening flow before state exists.
- Resilience: fallback reads and retries absorb transient plugin instability.
- Performance: short lookup budgets and async non-critical work reduce UI latency.

## Quick Sequence Summary
1. Send route validates seller/phone, prepares state, sends template.
2. User opens flow, Meta sends encrypted callbacks.
3. Callback route decrypts payload and dispatches screen logic.
4. WELCOME checks state and selects SIGN_IN or SIGN_UP.
5. SIGN_UP sets code (with fallback prepare+retry).
6. SIGN_IN activates session and sends menu.
