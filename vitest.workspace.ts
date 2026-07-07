// ──────────────────────────────────────────────────────
// Vitest Workspace — SDK + adapters tests
// ──────────────────────────────────────────────────────
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'sdk',
          root: './packages/sdk',
          include: ['src/__tests__/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'express',
          root: './packages/express',
          include: ['src/__tests__/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'next',
          root: './packages/next',
          include: ['src/__tests__/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'hono',
          root: './packages/hono',
          include: ['src/__tests__/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'cli',
          root: './packages/cli',
          include: ['src/__tests__/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'react',
          root: './packages/react',
          include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
        },
      },
      {
        test: {
          name: 'create-app',
          root: './packages/create-app',
          include: ['src/__tests__/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'mcp',
          root: './packages/mcp',
          include: ['src/__tests__/**/*.test.ts'],
        },
      },
    ],
  },
 {
    test: {
      name: 'express',
      root: './packages/express',
      include: ['src/__tests__/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'next',
      root: './packages/next',
      include: ['src/__tests__/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'hono',
      root: './packages/hono',
      include: ['src/__tests__/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'fastify',
      root: './packages/fastify',
      include: ['src/__tests__/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'koa',
      root: './packages/koa',
      include: ['src/__tests__/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'cli',
      root: './packages/cli',
      include: ['src/__tests__/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'react',
      root: './packages/react',
      include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    },
  },
  {
    test: {
      name: 'create-app',
      root: './packages/create-app',
      include: ['src/__tests__/**/*.test.ts'],
    },
  },
])
