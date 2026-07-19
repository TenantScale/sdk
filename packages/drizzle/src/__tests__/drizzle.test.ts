import { describe, expect, it, vi } from 'vitest'
import { createTenantSafeDrizzle } from '../index.js'

describe('createTenantSafeDrizzle', () => {
  it('adds tenant filters to select operations', async () => {
    const selectSpy = vi.fn().mockResolvedValue([{ id: 1 }])
    const drizzle = {
      select: () => ({
        from: () => ({
          where: selectSpy,
        }),
      }),
    }

    const guarded = createTenantSafeDrizzle(drizzle as any, 'tenant-1')
    const result = await guarded.select().from('tickets').where()

    expect(result).toEqual([{ id: 1 }])
    expect(selectSpy).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it('adds tenant filters to insert operations', async () => {
    const insertSpy = vi.fn().mockResolvedValue([{ id: 2 }])
    const drizzle = {
      insert: () => ({
        into: () => ({
          values: insertSpy,
        }),
      }),
    }

    const guarded = createTenantSafeDrizzle(drizzle as any, 'tenant-2')
    const result = await guarded.insert().into('tickets').values({ title: 'hi' })

    expect(result).toEqual([{ id: 2 }])
    expect(insertSpy).toHaveBeenCalledWith({ title: 'hi', tenant_id: 'tenant-2' })
  })

  it('adds tenant filters to update operations', async () => {
    const updateSpy = vi.fn().mockResolvedValue({ rowCount: 1 })
    const drizzle = {
      update: () => ({
        set: () => ({
          where: updateSpy,
        }),
      }),
    }

    const guarded = createTenantSafeDrizzle(drizzle as any, 'tenant-3')
    const result = await guarded.update().set({ title: 'new' }).where()

    expect(result).toEqual({ rowCount: 1 })
    expect(updateSpy).toHaveBeenCalledWith('tenant_id', 'tenant-3')
  })

  it('adds tenant filters to delete operations', async () => {
    const deleteSpy = vi.fn().mockResolvedValue({ rowCount: 1 })
    const drizzle = {
      delete: () => ({
        from: () => ({
          where: deleteSpy,
        }),
      }),
    }

    const guarded = createTenantSafeDrizzle(drizzle as any, 'tenant-4')
    const result = await guarded.delete().from('tickets').where()

    expect(result).toEqual({ rowCount: 1 })
    expect(deleteSpy).toHaveBeenCalledWith('tenant_id', 'tenant-4')
  })

  it('supports a custom tenant column name', async () => {
    const selectSpy = vi.fn().mockResolvedValue([{ id: 3 }])
    const drizzle = {
      select: () => ({
        from: () => ({
          where: selectSpy,
        }),
      }),
    }

    const guarded = createTenantSafeDrizzle(drizzle as any, 'tenant-5', { tenantColumn: 'tenant' })
    await guarded.select().from('tickets').where()

    expect(selectSpy).toHaveBeenCalledWith('tenant', 'tenant-5')
  })

  it('throws when tenant id is missing', () => {
    expect(() => createTenantSafeDrizzle({} as any, '')).toThrow('tenantId is required')
  })
})
