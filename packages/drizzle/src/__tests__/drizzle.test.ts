import { describe, expect, it } from 'vitest'
import { tenantFilter } from '../index.js'

describe('tenantFilter', () => {
  it('creates a SQL expression for tenant filtering', () => {
    const mockColumn = { name: 'tenant_id' } as any
    const filter = tenantFilter(mockColumn, 'tenant-1')

    expect(filter).toBeDefined()
    expect(typeof filter).toBe('object')
  })

  it('throws when tenantId is empty', () => {
    const mockColumn = { name: 'tenant_id' } as any
    expect(() => tenantFilter(mockColumn, '')).toThrow('tenantId is required')
  })

  it('throws when tenantId is undefined', () => {
    const mockColumn = { name: 'tenant_id' } as any
    expect(() => tenantFilter(mockColumn, undefined as any)).toThrow('tenantId is required')
  })

  it('works with string tenant IDs', () => {
    const mockColumn = { name: 'tenant_id' } as any
    const filter = tenantFilter(mockColumn, 'tenant-123')

    expect(filter).toBeDefined()
  })

  it('works with numeric tenant IDs', () => {
    const mockColumn = { name: 'tenant_id' } as any
    const filter = tenantFilter(mockColumn, '123')

    expect(filter).toBeDefined()
  })
})
