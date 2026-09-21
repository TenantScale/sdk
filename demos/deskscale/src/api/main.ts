import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AppModule } from './app.module.js'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  app.enableCors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], credentials: true })
  // Serve the built SPA (after `pnpm build`) so one process runs the whole demo.
  const port = 4000
  await app.listen(port)
  const l = new Logger('DeskScale')
  l.log(`DeskScale API live at http://localhost:${port}/api`)
  l.log(
    `Frontend: http://localhost:5173 (dev) after \`pnpm --filter @tenantscale/demo-deskscale dev\``,
  )
}

void bootstrap()
