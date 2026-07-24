import { describe, expect, it, vi } from 'vitest'
import { withTenantScope, tenantFilter } from '../index.js'

// Mock Prisma client types for testing
type MockPrismaClient = {
  $extends: (extension: any) => MockPrismaClient
  user: {
    findMany: (args?: any) => Promise<any[]>
    findFirst: (args?: any) => Promise<any>
    findUnique: (args?: any) => Promise<any>
    create: (args: any) => Promise<any>
    createMany: (args: any) => Promise<any>
    update: (args: any) => Promise<any>
    updateMany: (args: any) => Promise<any>
    delete: (args: any) => Promise<any>
    deleteMany: (args: any) => Promise<any>
    upsert: (args: any) => Promise<any>
  }
}

describe('withTenantScope', () => {
  it('creates a Prisma client extension', () => {
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    expect(extension).toBeDefined()
    expect(extension.name).toBe('tenantScope')
    expect(extension.query).toBeDefined()
    expect(extension.query.$allOperations).toBeDefined()
  })

  it('throws when tenantId is empty', () => {
    expect(() => withTenantScope({ tenantId: '' })).toThrow('tenantId is required')
  })

  it('throws when tenantId is undefined', () => {
    expect(() => withTenantScope({ tenantId: undefined as any })).toThrow('tenantId is required')
  })

  it('uses custom tenant column name when provided', () => {
    const extension = withTenantScope({ tenantId: 'tenant-123', tenantColumn: 'org_id' })

    expect(extension).toBeDefined()
    expect(extension.name).toBe('tenantScope')
  })

  it('injects tenant filter into findMany operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue([])
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'findMany',
      args: {},
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
    expect(mockQuery).toHaveBeenCalled()
  })

  it('injects tenant filter into findFirst operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue(null)
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'findFirst',
      args: {},
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
  })

  it('injects tenant filter into findUnique operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue(null)
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'findUnique',
      args: { where: { id: 'user-1' } },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
    expect(mockArgs.args.where.id).toBe('user-1')
  })

  it('injects tenant filter into findFirstOrThrow operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue(null)
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'findFirstOrThrow',
      args: {},
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
  })

  it('injects tenant filter into findUniqueOrThrow operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue(null)
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'findUniqueOrThrow',
      args: { where: { id: 'user-1' } },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
    expect(mockArgs.args.where.id).toBe('user-1')
  })

  it('injects tenant filter into count operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue(5)
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'count',
      args: {},
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
  })

  it('injects tenant filter into aggregate operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue({})
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'aggregate',
      args: {},
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
  })

  it('injects tenant filter into groupBy operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue([])
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'groupBy',
      args: {},
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
  })

  it('merges tenant filter with existing where clause in findMany', async () => {
    const mockQuery = vi.fn().mockResolvedValue([])
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'findMany',
      args: { where: { status: 'active' } },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
    expect(mockArgs.args.where.status).toBe('active')
  })

  it('injects tenant filter into update operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue({})
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'update',
      args: { where: { id: 'user-1' }, data: { name: 'Updated' } },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
    expect(mockArgs.args.where.id).toBe('user-1')
  })

  it('injects tenant filter into updateMany operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ count: 1 })
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'updateMany',
      args: { data: { status: 'inactive' } },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
  })

  it('injects tenant filter into updateOrThrow operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue({})
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'updateOrThrow',
      args: { where: { id: 'user-1' }, data: { name: 'Updated' } },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
  })

  it('injects tenant filter into delete operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue({})
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'delete',
      args: { where: { id: 'user-1' } },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
  })

  it('injects tenant filter into deleteMany operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ count: 1 })
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'deleteMany',
      args: {},
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
  })

  it('injects tenant filter into deleteOrThrow operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue({})
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'deleteOrThrow',
      args: { where: { id: 'user-1' } },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
  })

  it('skips raw query operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue([])
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: '$queryRaw',
      args: { query: 'SELECT * FROM users' },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeUndefined()
    expect(mockQuery).toHaveBeenCalledWith(mockArgs)
  })

  it('skips executeRaw operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue([])
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: '$executeRaw',
      args: { query: 'DELETE FROM users' },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeUndefined()
    expect(mockQuery).toHaveBeenCalledWith(mockArgs)
  })

  it('injects tenant_id into create operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue({})
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'create',
      args: { data: { name: 'John', email: 'john@example.com' } },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.data).toBeDefined()
    expect(mockArgs.args.data.tenant_id).toBe('tenant-123')
    expect(mockArgs.args.data.name).toBe('John')
  })

  it('does not overwrite existing tenant_id in create operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue({})
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'create',
      args: { data: { name: 'John', tenant_id: 'custom-tenant' } },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.data.tenant_id).toBe('custom-tenant')
  })

  it('handles null data in create operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue({})
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'create',
      args: { data: null },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.data).toBeDefined()
    expect(mockArgs.args.data.tenant_id).toBe('tenant-123')
  })

  it('injects tenant_id into createMany operations with single object', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ count: 1 })
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'createMany',
      args: { data: { name: 'John', email: 'john@example.com' } },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.data).toBeDefined()
    expect(mockArgs.args.data.tenant_id).toBe('tenant-123')
  })

  it('injects tenant_id into createMany operations with array', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ count: 2 })
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'createMany',
      args: {
        data: [
          { name: 'John', email: 'john@example.com' },
          { name: 'Jane', email: 'jane@example.com' },
        ],
      },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.data).toBeDefined()
    expect(Array.isArray(mockArgs.args.data)).toBe(true)
    expect(mockArgs.args.data[0].tenant_id).toBe('tenant-123')
    expect(mockArgs.args.data[1].tenant_id).toBe('tenant-123')
  })

  it('does not overwrite existing tenant_id in createMany array', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ count: 2 })
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'createMany',
      args: {
        data: [
          { name: 'John', tenant_id: 'custom-1' },
          { name: 'Jane', tenant_id: 'custom-2' },
        ],
      },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.data[0].tenant_id).toBe('custom-1')
    expect(mockArgs.args.data[1].tenant_id).toBe('custom-2')
  })

  it('handles null items in createMany array', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ count: 2 })
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'createMany',
      args: {
        data: [{ name: 'John' }, null, { name: 'Jane' }],
      },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.data[0].tenant_id).toBe('tenant-123')
    expect(mockArgs.args.data[1]).toEqual({ tenant_id: 'tenant-123' })
    expect(mockArgs.args.data[2].tenant_id).toBe('tenant-123')
  })

  it('injects tenant_id into upsert operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue({})
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'upsert',
      args: {
        where: { id: 'user-1' },
        create: { name: 'John', email: 'john@example.com' },
        update: { name: 'John Updated' },
      },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where.tenant_id).toBe('tenant-123')
    expect(mockArgs.args.create.tenant_id).toBe('tenant-123')
    expect(mockArgs.args.update.tenant_id).toBe('tenant-123')
  })

  it('does not overwrite existing tenant_id in upsert create', async () => {
    const mockQuery = vi.fn().mockResolvedValue({})
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'upsert',
      args: {
        where: { id: 'user-1' },
        create: { name: 'John', tenant_id: 'custom-tenant' },
        update: { name: 'John Updated' },
      },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.create.tenant_id).toBe('custom-tenant')
  })

  it('does not overwrite existing tenant_id in upsert update', async () => {
    const mockQuery = vi.fn().mockResolvedValue({})
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    const mockArgs = {
      operation: 'upsert',
      args: {
        where: { id: 'user-1' },
        create: { name: 'John' },
        update: { name: 'John Updated', tenant_id: 'custom-tenant' },
      },
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.update.tenant_id).toBe('custom-tenant')
  })

  it('uses custom tenant column name in operations', async () => {
    const mockQuery = vi.fn().mockResolvedValue([])
    const extension = withTenantScope({ tenantId: 'tenant-123', tenantColumn: 'org_id' })

    const mockArgs = {
      operation: 'findMany',
      args: {},
      model: 'user',
    }

    await extension.query.$allOperations({
      args: mockArgs,
      query: mockQuery,
      model: 'user',
    } as any)

    expect(mockArgs.args.where).toBeDefined()
    expect(mockArgs.args.where.org_id).toBe('tenant-123')
    expect(mockArgs.args.where.tenant_id).toBeUndefined()
  })

  it('handles transaction operations correctly', async () => {
    const mockQuery = vi.fn().mockResolvedValue({})
    const extension = withTenantScope({ tenantId: 'tenant-123' })

    // Simulate operations that might occur within a transaction
    const operations = [
      { operation: 'create', args: { data: { name: 'John' } }, model: 'user' },
      {
        operation: 'update',
        args: { where: { id: 'user-1' }, data: { name: 'Updated' } },
        model: 'user',
      },
      { operation: 'findMany', args: {}, model: 'user' },
    ]

    for (const mockArgs of operations) {
      await extension.query.$allOperations({
        args: mockArgs,
        query: mockQuery,
        model: 'user',
      } as any)
    }

    // Verify all operations were scoped correctly
    expect(mockQuery).toHaveBeenCalledTimes(3)
  })
})

describe('tenantFilter', () => {
  it('creates a tenant filter object', () => {
    const filter = tenantFilter('tenant-123')

    expect(filter).toBeDefined()
    expect(filter.tenant_id).toBe('tenant-123')
  })

  it('throws when tenantId is empty', () => {
    expect(() => tenantFilter('')).toThrow('tenantId is required')
  })

  it('throws when tenantId is undefined', () => {
    expect(() => tenantFilter(undefined as any)).toThrow('tenantId is required')
  })

  it('uses custom column name when provided', () => {
    const filter = tenantFilter('tenant-123', 'org_id')

    expect(filter).toBeDefined()
    expect(filter.org_id).toBe('tenant-123')
    expect(filter.tenant_id).toBeUndefined()
  })

  it('works with string tenant IDs', () => {
    const filter = tenantFilter('tenant-abc-123')

    expect(filter.tenant_id).toBe('tenant-abc-123')
  })

  it('works with numeric tenant IDs as strings', () => {
    const filter = tenantFilter('12345')

    expect(filter.tenant_id).toBe('12345')
  })
})
