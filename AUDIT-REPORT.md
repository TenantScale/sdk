# TenantScale SDK — Code Quality Audit Report

**Date:** 2026-07-24  
**Scope:** All 11 packages under `packages/`  
**Files analyzed:** 110 TypeScript source files  

---

## CRITICAL (6 findings)

### C1. Massive duplicate code across 4 framework adapters (Express, Fastify, Hono, Koa)
**Files:**
- `packages/express/src/middleware.ts` (413 lines)
- `packages/fastify/src/middleware.ts` (276 lines)
- `packages/hono/src/middleware.ts` (507 lines)
- `packages/koa/src/middleware.ts` (296 lines)

**Issue:** These 4 files are ~85% identical in logic. Each implements the same 9 middleware functions (`authenticateApiKey`, `requireScope`, `requirePortalSession`, `requirePortalRole`, `requireSuperAdmin`, `requirePlanLimit`, `rateLimitByApiKey`, `rateLimitByIp`, `auditLog`) with only framework-API surface differences (e.g. Express uses `req/next`, Fastify uses `req/reply`, Hono uses `c/next`, Koa uses `ctx/next`). The error handling, header extraction, audit logging, and rate limiting logic is copy-pasted with minor changes.

**Impact:** ~1,492 lines of duplicated logic. Any bug fix or feature addition must be applied 4 times. This is the single biggest maintenance liability.

**Recommendation:** Extract a shared core package (e.g. `@tenantscale/core-middleware`) that defines framework-agnostic middleware factories. Each adapter becomes a thin ~50-line wrapper that maps framework types.

---

### C2. Hono `authenticateApiKey` requires `Bearer` prefix while others accept raw token
**File:** `packages/hono/src/middleware.ts`, lines 61-119  
**vs** `packages/express/src/middleware.ts`, lines 54-92  
**vs** `packages/fastify/src/middleware.ts`, lines 31-68  
**vs** `packages/koa/src/middleware.ts`, lines 26-66

**Issue:** The Hono adapter's `authenticateApiKey`:
1. Defaults `apiKeyHeader` to `'Authorization'` (not `'x-api-key'`)
2. Requires the header value to start with `'Bearer '` (line 69)
3. Strips the `'Bearer '` prefix before passing to `validateApiKey` (line 79)

All other adapters default to `'x-api-key'` and pass the raw header value directly to `validateApiKey`. This means the Hono adapter has an incompatible API contract with the other 3 adapters.

**Impact:** Users switching between frameworks get inconsistent auth behavior. A Hono user must send `Authorization: Bearer *** while Express/Koa/Fastify users send `x-api-key: tk_xxx`.

---

### C3. Express `ipHeader` option defined in types but never read in middleware
**File:** `packages/express/src/types.ts`, lines 49-54  
**File:** `packages/express/src/middleware.ts`, lines 20-27

**Issue:** The `ExpressAdapterOptions` interface defines an `ipHeader?: string` option (with documentation about customizing the IP header name), but `resolveClientIp()` in `middleware.ts` always checks hardcoded header names `x-forwarded-for` and `x-real-ip` and ignores the `ipHeader` config entirely. Same issue exists in `packages/fastify/src/types.ts` (no `ipHeader` defined, but also not needed since it's never read).

---

### C4. Hono middleware file is 507 lines — should be split
**File:** `packages/hono/src/middleware.ts` (507 lines)

**Issue:** This is the largest source file in the entire codebase. It contains 9 exported functions plus 2 helpers. At >500 lines it exceeds the 300-line threshold. The other 3 adapter middleware files are also large (Express: 413, Koa: 296, Fastify: 276).

**Recommendation:** Split each middleware file into at least 3 modules: auth (`authenticateApiKey`, `requireScope`, `requirePortalSession`, etc.), enforcement (`requirePlanLimit`, `rateLimitByApiKey`, `rateLimitByIp`), and audit (`auditLog`).

---

### C5. SDK types.ts is 342 lines — mixes error classes, interfaces, and DB types
**File:** `packages/sdk/src/types.ts` (342 lines)

**Issue:** This single file contains: 7 error classes, 15+ data interfaces, the Logger interface, and 8+ DB type helpers. Error classes are co-located with pure data types. The file mixes concerns — errors are runtime code, interfaces are compile-time types, and DB types are schema models.

**Recommendation:** Split into `errors.ts` (error classes), `types.ts` (SDK interfaces), and `db-types.ts` (database row types).

---

### C6. Unused `hasRequiredScope` export is dead code
**File:** `packages/sdk/src/index.ts`, line 15  
**File:** `packages/sdk/src/auth.ts`, lines 77-79

**Issue:** `hasRequiredScope` is exported from the barrel file but is never used by any adapter, the SDK class itself, or any consumer. Only `requireScope` (which wraps `hasRequiredScope`) is used internally. This is dead public API surface — it adds to documentation overhead and signals an incomplete abstraction.

---

## MAJOR (12 findings)

### M1. 50+ uses of `as any` casts across the codebase
**Files:** Throughout all packages. Key locations:
- `packages/fastify/src/middleware.ts`: Lines 43, 44, 73, 107, 109, 125, 144, 167, 197, 252, 253, 257, 258 — heavy use of `(req as FastifyRequest & { tenantKey?: any })` pattern to attach custom properties
- `packages/koa/src/middleware.ts`: Lines 38, 39, 71, 107, 109, 127, 148, 167, 173, 207, 269, 275, 276 — same pattern
- `packages/hono/src/middleware.ts`: Lines 109, 136, 203, 231, 266, 301, 331, 362, 387, 430, 473, 482, 483 — uses `as` casts
- `packages/sdk/src/auth.ts`:46 — `keyRecord.tenant as unknown as { ... }`
- `packages/sdk/src/session.ts`:68 — `membership.tenant as unknown as { ... }`
- `packages/sdk/src/stripe.ts`:47 — `this.apiVersion as any` (Stripe API version bypass)
- `packages/express/src/error-handler.ts`:62 — `(err as any).retryAfter`
- `packages/hono/src/error-handler.ts`:66 — `(err as any).retryAfter`
- `packages/next/src/error-handler.ts`:48 — `(err as any).retryAfter`

**Impact:** Bypasses TypeScript safety, masks real type errors, makes refactoring harder.

---

### M2. 6 uses of `as unknown as` double-casts
**Files:**
- `packages/sdk/src/auth.ts`:46 — `keyRecord.tenant as unknown as { id: string; is_active: boolean }`
- `packages/sdk/src/session.ts`:68 — `membership.tenant as unknown as { id: string; name: string; slug: string }`
- `packages/sdk/src/plan.ts`:154 — `plan as unknown as Record<string, unknown>`
- `packages/express/src/__tests__/express.test.ts`:48, 74, 81

**Issue:** The auth/session casts indicate that the Supabase join query result types are not properly typed. The SDK assumes the shape of joined data without type safety.

---

### M3. Missing return types on most adapter middleware functions
**Files:** All 4 adapter middleware files:
- `packages/express/src/middleware.ts`: All 9 exported functions — only `authenticateApiKey` has an explicit `AsyncMiddleware` return type (line 54); the other 8 lack return types (except the local-use `AsyncMiddleware` type alias defined at line 413)
- `packages/fastify/src/middleware.ts`: Zero of 9 functions have return types
- `packages/hono/src/middleware.ts`: Zero of 9 functions have return types
- `packages/koa/src/middleware.ts`: Zero of 9 functions have return types

---

### M4. Hono `requireScope` and `requirePortalRole` use silent error catching (no `err` variable)
**File:** `packages/hono/src/middleware.ts`, lines 145, 240

**Issue:** 
```typescript
} catch {
  return c.json({ error: '...', code: 'MISSING_SCOPE' }, 403)
}
```
The `catch` clause has no binding variable, making it impossible to log the actual error. Compare with Express which passes errors through `next(err)` to the error handler. Hono silently returns a 403 without any error logging.

---

### M5. Inconsistent error handling pattern across adapters
- **Express:** All middleware functions call `next(err)` on error, delegating to the error handler middleware. Clean separation.
- **Fastify:** All middleware functions catch errors and send inline responses with `reply.code(...).send(...)`. Mixed pattern.
- **Hono:** Some functions return error JSON directly (authenticateApiKey, requireScope), others rely on the errorHandler. Inconsistent within the same file.
- **Koa:** Same as Fastify — inline error responses.

**Impact:** Error handling behavior differs by framework.

---

### M6. Hono adapter default header names and option names differ from all other adapters
**File:** `packages/hono/src/types.ts`, lines 35, 41  
**vs** `packages/express/src/types.ts`, lines 41, 47  
**vs** `packages/fastify/src/types.ts`, lines 15, 18  
**vs** `packages/koa/src/types.ts`, lines 10, 11

**Issue:**
- Hono defaults: `apiKeyHeader = 'Authorization'`, `sessionHeader = 'Authorization'`
- Express defaults: `apiKeyHeader = 'x-api-key'`, `authHeader = 'authorization'`
- Hono uses `sessionHeader` option name vs `authHeader` in all others

---

### M7. `auditLog` middleware uses optional chaining inconsistently
**Files:**
- `packages/hono/src/middleware.ts`, lines 498-499: `options.ts.logger.error(...)` — assumes exists
- `packages/express/src/middleware.ts`, line 405: `options.ts.logger.error(...)` — assumes exists
- `packages/fastify/src/middleware.ts`, lines 272-273: `options.ts.logger?.error?.(...)` — uses optional chaining
- `packages/koa/src/middleware.ts`, lines 290-291: `options.ts.logger?.error?.(...)` — uses optional chaining

---

### M8. `getClientIp` in SDK core vs `resolveClientIp` in each adapter — duplicated IP resolution
**Files:**
- `packages/sdk/src/audit.ts`, lines 30-63 — `getClientIp()` handles both `Headers` and `Record` types
- `packages/express/src/middleware.ts`, lines 20-27 — `resolveClientIp()` with Express-specific types
- `packages/fastify/src/middleware.ts`, lines 13-24 — `resolveClientIp()` with Fastify-specific types
- `packages/hono/src/middleware.ts`, lines 31-37 — `resolveClientIp()` with Hono-specific types
- `packages/koa/src/middleware.ts`, lines 13-20 — `resolveClientIp()` with Koa-specific types

**Issue:** The SDK core already has a framework-agnostic `getClientIp()` function that handles both Web API `Headers` and plain records. But every adapter reimplements its own version with slightly different logic (Fastify handles array headers, others don't; Koa uses `ctx.get()`; Hono uses `c.req.header()`; Express handles `req.ip` fallback).

---

### M9. `createAuditEvent` utility exported but never used by any middleware or SDK code
**File:** `packages/sdk/src/audit.ts`, lines 95-108  
**File:** `packages/sdk/src/index.ts`, line 25

**Issue:** `createAuditEvent` is a helper that creates an `AuditEventInput` with defaults, but it's never used by any adapter or the SDK itself. Zero internal consumers.

---

### M10. `validateSessionApiKey` is a confusing dead alias export
**File:** `packages/sdk/src/index.ts`, line 16

**Issue:** 
```typescript
export { validateApiKey as validateSessionApiKey } from './auth.js'
```
This re-exports `validateApiKey` under the name `validateSessionApiKey`, but no code references this alias. The term "session API key" doesn't correspond to any concept in the SDK.

---

### M11. Express `AsyncMiddleware` type defined in two places
**Files:**
- `packages/express/src/types.ts`, line 60 — `export type AsyncMiddleware`
- `packages/express/src/middleware.ts`, line 413 — `type AsyncMiddleware` (local, shadow)

**Issue:** The type is defined as a local (non-exported) type in middleware.ts and also as an exported type in types.ts. Both are identical. The local definition should be removed.

---

### M12. Fastify/Koa lack module augmentation for custom request properties
**Files:**
- `packages/express/src/types.ts`, lines 10-23 — Uses `declare global { namespace Express { interface Request { ... } } }` for clean, type-safe augmentation
- `packages/fastify/src/middleware.ts` — Uses `(req as FastifyRequest & { tenantKey?: any })` everywhere
- `packages/koa/src/middleware.ts` — Uses `(ctx as Context & { tenantKey?: any })` everywhere

**Issue:** Express has proper type augmentation. Fastify and Koa rely on intersection types with `any` fields, losing type safety. Fastify should use `declare module 'fastify' { interface FastifyRequest { ... } }` and Koa should do the same for `Context`.

---

## MINOR (15 findings)

### m1. Inline magic numbers
| File | Line | Value | Context |
|------|------|-------|---------|
| `packages/sdk/src/sdk.ts` | 92 | `10_000` | Inline magic number for Supabase fetch timeout |
| `packages/react/src/client.ts` | 75 | `60_000` (1min cache TTL) | Inline milliseconds |
| `packages/react/src/client.ts` | 78 | `100` (max cache size) | Inline magic number |
| `packages/sdk/src/rate-limit.ts` | 13-16 | `5 * 60 * 1000`, `5`, `3_600_000`, `300_000` | Named constants exist ✓ but values still magic |
| `packages/sdk/src/webhook.ts` | 11-14 | `3`, `[1_000, 4_000, 15_000]`, `10_000` | Well-named constants ✓ |

### m2. React client cache eviction uses inefficient sort+slice
**File:** `packages/react/src/client.ts`, lines 78-85
**Issue:** Sorts the entire cache map on every insert when size exceeds 100 is O(n log n). Evicts oldest entries rather than closest-to-expiry. If size is 101, sorts all 101 entries just to delete 1.

### m3. Multiple `console.*` calls outside CLI package
**Files:**
- `packages/mcp/src/index.ts`:34-36 — `console.error` for server messages
- `packages/next/src/error-handler.ts`:66-68 — `console.error` for unhandled errors
**Issue:** Using `console` directly instead of the SDK's logger interface.

### m4. Hono middleware missing configurable context key for `requirePlanLimit`
**File:** `packages/hono/src/middleware.ts`, line 301
- `authenticateApiKey` uses `options.apiKeyContextKey` ✓
- `requirePlanLimit` uses hardcoded `c.get('tenantId')` ✗ — no configurable context key
- The context key pattern is inconsistently applied within the same file

### m5. Logger interface uses `any[]` params
**File:** `packages/sdk/src/types.ts`, lines 237-241
```typescript
export interface Logger {
  info: (...args: any[]) => void
}
```
Could be `unknown[]` for better type safety.

### m6. `DEFAULT_USER_AGENT = 'TenantScale-Webhook/1.0'` version string won't auto-update
**File:** `packages/sdk/src/webhook.ts`, line 14 — hardcoded version `1.0`

### m7. Webhook delivery ignores rejected promises silently
**File:** `packages/sdk/src/webhook.ts`, lines 91-97
`Promise.allSettled` results are filtered to only `fulfilled` results. Rejected deliveries are silently dropped without logging.

### m8. No cover for edge case: `authenticateApiKey` on Express/Koa with empty string token
If a request sends `x-api-key: ` (empty string after colon), Express passes it to `validateApiKey` which throws `"Empty API key"`. Hono correctly checks for empty token at line 80-82. Express/Koa/Fastify rely on the SDK to catch this. Minor inconsistency.

### m9. Duplicate type re-exports across all adapters
Every adapter's `types.ts` re-exports `ApiKeyInfo` and `PortalSessionInfo` from `@tenantscale/sdk`. Creates a minor maintenance burden but is a common convenience pattern.

### m10. No test for `auditLog` with missing tenantId (silent skip)
**Files:** All adapter tests.
The `auditLog` middleware silently skips when `tenantId` is not set. This is intentional, but no test verifies this behavior across adapters.

### m11. `packages/next/src/app-router.ts` hardcodes cookie name `'tenant_session'`
**File:** `packages/next/src/app-router.ts`, line 22
The cookie name `'tenant_session'` is hardcoded with no configuration option.

### m12. `packages/next/src/types.ts` defines `RouteHandlerConfig` but it's never used by any code
**File:** `packages/next/src/types.ts`, lines 46-73
The `RouteHandlerConfig` interface (with `auth`, `scope`, `roles`, `planLimit` fields) is defined but never referenced by any exported function. The actual handler wrappers (`createHandler`) use a different API shape.

### m13. `packages/sdk/src/ssrf.ts` skips IPv6 entirely
**File:** `packages/sdk/src/ssrf.ts`, line 42
```typescript
if (ip.includes(':')) return false // Skip IPv6 for now (minimal support needed)
```
IPv6 loopback (::1) is in the blocked hostnames set, but any other IPv6 address is silently allowed. This is a potential SSRF bypass vector.

### m14. `packages/express/src/middleware.ts` line 413 defines `AsyncMiddleware` type at EOF
This is in the "Type helper" section but is an unexported type at the bottom of the file. Since it's used within the file, it should be at the top.

### m15. `packages/hono/src/middleware.ts` line 507 has type imports at the very end
```typescript
import type { ApiKeyInfo, PortalSessionInfo } from '@tenantscale/sdk'
```
These type imports are placed at the bottom of the file (line 507) instead of the top with the other imports. This is an unusual convention that could confuse readers.

---

## Summary

| Severity | Count | Key Areas |
|----------|-------|-----------|
| **Critical** | 6 | Massive duplication across 4 adapters, Hono API incompatibility, large files needing split, dead exports |
| **Major** | 12 | `as any` overuse (50+ casts), missing return types, inconsistent error handling, dead exports, duplicated IP resolution logic |
| **Minor** | 15 | Magic numbers, cache inefficiency, naming inconsistencies, minor edge cases |

**Total findings: 33**

### Top 3 Strategic Fixes

1. **Extract a shared middleware core package** — The 4 framework adapters are ~85% identical. A shared package with framework-agnostic middleware factories would eliminate ~1,200 lines of duplication (~80% of adapter code) and ensure consistent behavior.

2. **Align Hono with other adapters** — Change `authenticateApiKey` default header from `Authorization` (Bearer-requiring) to `x-api-key` (raw token), aligning with Express/Koa/Fastify. Or document the intentional difference and add the Bearer pattern to all adapters for consistency.

3. **Add proper TypeScript module augmentation for Fastify/Koa** — Express already uses `declare global { namespace Express { interface Request { ... } } }`. Fastify should use `declare module 'fastify'` and Koa should use module augmentation for `Context` to eliminate the pervasive `as any` casts.
