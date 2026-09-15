import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

// ── Demo bootstrap ──────────────────────────────────────────────
//
// After `pnpm --filter @tenantscale/demo-nestjs start`, curl this server:
//
//   curl -i -H "x-api-key: demo-acme-key" \
//     "http://localhost:3000/widgets?page=1"
//
//   curl -i -X POST -H "x-api-key: demo-acme-key" \
//     -H "content-type: application/json" \
//     -d '{"name":"widget-1"}' \
//     "http://localhost:3000/widgets"
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  await app.listen(3000)
  // eslint-disable-next-line no-console
  console.log('TenantScale × NestJS demo listening on http://localhost:3000')
}

void bootstrap()
