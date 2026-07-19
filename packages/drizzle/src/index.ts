import type { TenantSafeDrizzleOptions } from './types.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function applyTenantFilter(value: unknown, tenantId: string, tenantColumn: string) {
  if (!tenantId) {
    throw new Error('tenantId is required')
  }

  if (!isPlainObject(value)) {
    return value
  }

  return {
    ...value,
    [tenantColumn]: tenantId,
  }
}

function wrapResult<T extends object>(target: T, tenantId: string, tenantColumn: string): T {
  if (!target || typeof target !== 'object') {
    return target
  }

  return new Proxy(target, {
    get(targetObject, prop, receiver) {
      const value = Reflect.get(targetObject, prop, receiver)

      if (typeof value !== 'function') {
        return value
      }

      if (prop === 'where') {
        return (...args: unknown[]) => {
          const whereArgs = args.length > 0 ? args : [tenantColumn, tenantId]
          return value.apply(targetObject, whereArgs)
        }
      }

      if (prop === 'values' || prop === 'set') {
        return (...args: unknown[]) => {
          const payload = args[0]
          const wrappedPayload = applyTenantFilter(payload, tenantId, tenantColumn)
          return wrapResult(value.apply(targetObject, [wrappedPayload]) as object, tenantId, tenantColumn)
        }
      }

      return (...args: unknown[]) => {
        const result = value.apply(targetObject, args)
        return result && typeof result === 'object'
          ? wrapResult(result as object, tenantId, tenantColumn)
          : result
      }
    },
  }) as T
}

export type { TenantSafeDrizzleOptions } from './types.js'

export function createTenantSafeDrizzle<T extends object>(drizzle: T, tenantId: string, options: Partial<TenantSafeDrizzleOptions> = {}): T {
  if (!tenantId) {
    throw new Error('tenantId is required')
  }

  const tenantColumn = options.tenantColumn ?? 'tenant_id'

  return new Proxy(drizzle, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)

      if (typeof value !== 'function') {
        return value
      }

      return (...args: unknown[]) => {
        const result = value.apply(target, args)
        return wrapResult(result as object, tenantId, tenantColumn)
      }
    },
  }) as T
}
