/*
 * MIT License
 *
 * Copyright (c) 2026 TenantScale
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

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
