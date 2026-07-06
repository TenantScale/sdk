# @tenantscale/koa

Koa middleware for TenantScale.

## Installation

```bash
pnpm add @tenantscale/koa koa
```

## Usage

```ts
import Koa from 'koa'
import { authenticateApiKey, errorHandler } from '@tenantscale/koa'

const app = new Koa()
app.use(authenticateApiKey({ ts }))
app.on('error', errorHandler())
```
