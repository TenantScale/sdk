# @tenantscale/fastify

Fastify middleware for TenantScale.

## Installation

```bash
pnpm add @tenantscale/fastify fastify
```

## Usage

```ts
import Fastify from 'fastify'
import { authenticateApiKey, requireScope, errorHandler } from '@tenantscale/fastify'

const app = Fastify()

app.addHook('preHandler', authenticateApiKey({ ts }))
app.addHook('preHandler', requireScope({ ts }, 'admin'))
app.setErrorHandler(errorHandler())
```

## Features

- API key authentication
- portal session validation
- scope and role checks
- plan-limit and rate-limit enforcement
- audit logging
- standardized error responses
