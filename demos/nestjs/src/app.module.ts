import { Module } from '@nestjs/common'
import { TenantScaleModule } from '@tenantscale/nestjs'
import type { TenantScale } from '@tenantscale/sdk'
import { MockTenantScale } from './mock-tenant-scale.js'
import { WidgetsController } from './widgets.controller.js'

// The demo client only implements the methods the NestJS adapter calls. Casting
// is fine here — in a real app you pass a genuine TenantScale (or sdkOptions).
const demoClient = new MockTenantScale() as unknown as TenantScale

@Module({
  imports: [
    // Provide a mock client so the demo runs with zero configuration.
    // Swap this for real credentials in a real app:
    //
    //   TenantScaleModule.forRoot({
    //     sdkOptions: {
    //       supabaseUrl: process.env.SUPABASE_URL,
    //       supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    //     },
    //   })
    //
    TenantScaleModule.forRoot({
      tenantScale: demoClient,
    }),
  ],
  controllers: [WidgetsController],
})
export class AppModule {}
