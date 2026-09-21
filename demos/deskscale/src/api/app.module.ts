import { Module } from '@nestjs/common'
import { TenantScaleModule } from '@tenantscale/nestjs'
import type { TenantScale } from '@tenantscale/sdk'
import { DemoStore } from './demo-store.js'
import { AppController } from './app.controller.js'
import { ConversationsController } from './conversations.controller.js'
import { ContactsController } from './contacts.controller.js'
import { AdminController } from './admin.controller.js'
import { PulseService } from './pulse.service.js'
import { DEMO_STORE } from './tokens.js'

const demoStore = new DemoStore()

@Module({
  imports: [
    TenantScaleModule.forRoot({
      tenantScale: demoStore as unknown as TenantScale,
    }),
  ],
  controllers: [AppController, ContactsController, ConversationsController, AdminController],
  providers: [{ provide: DEMO_STORE, useValue: demoStore }, PulseService],
})
export class AppModule {}
