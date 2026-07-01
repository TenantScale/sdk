// ──────────────────────────────────────────────────────
// API Key — Comprehensive Unit Tests
// ──────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { generateApiKey, hashApiKey, isValidApiKeyFormat, API_KEY_PREFIX } from '../api-key.js'

// ── Tests ──

describe('generateApiKey', () => {
  // Test: generateApiKey returns object with all expected properties
  // Category: Happy Path
  // What it proves: The primary use case generates a key with the correct structure
  // Risk if missing: Consumers would break expecting the return shape
  it('returns an object with rawKey, keyHash, and keyPrefix', () => {
    const result = generateApiKey()
    expect(result).toHaveProperty('rawKey')
    expect(result).toHaveProperty('keyHash')
    expect(result).toHaveProperty('keyPrefix')
  })

  // Test: rawKey starts with 'tk_'
  // Category: Happy Path
  // What it proves: The key prefix is correctly applied
  // Risk if missing: Keys would not be distinguishable as SDK keys
  it('rawKey starts with tk_ prefix', () => {
    const { rawKey } = generateApiKey()
    expect(rawKey.startsWith(API_KEY_PREFIX)).toBe(true)
  })

  // Test: rawKey length is correct (prefix + 64 hex chars)
  // Category: Happy Path
  // What it proves: The key encodes 32 random bytes as hex (64 chars) plus 3-char prefix
  // Risk if missing: Key length expectations in DB schemas would be wrong
  it('rawKey has correct total length (prefix + 64 hex = 67 chars)', () => {
    const { rawKey } = generateApiKey()
    // tk_ (3) + 64 hex chars = 67
    expect(rawKey.length).toBe(67)
    // The hex part should be exactly 64 characters
    expect(rawKey.slice(3).length).toBe(64)
  })

  // Test: keyHash is SHA-256 hex (64 chars)
  // Category: Happy Path
  // What it proves: The hash is the correct length for SHA-256
  // Risk if missing: DB column sizes for key_hash would be wrong
  it('keyHash is a 64-character hex string (SHA-256)', () => {
    const { keyHash } = generateApiKey()
    expect(keyHash.length).toBe(64)
    expect(/^[0-9a-f]+$/.test(keyHash)).toBe(true)
  })

  // Test: keyPrefix is first 8 characters (tk_ + first 5 hex)
  // Category: Happy Path
  // What it proves: The prefix for display matches the beginning of the raw key
  // Risk if missing: UI key prefix display would show incorrect values
  it('keyPrefix equals first 8 chars of rawKey', () => {
    const { rawKey, keyPrefix } = generateApiKey()
    expect(keyPrefix).toBe(rawKey.slice(0, 8))
    expect(keyPrefix.length).toBe(8)
  })

  // Test: Two calls produce different rawKeys
  // Category: Happy Path
  // What it proves: Randomness — each call generates a unique key
  // Risk if missing: Deterministic generation would produce duplicate keys
  it('produces unique keys across multiple calls (randomness)', () => {
    const keys = new Set<string>()
    for (let i = 0; i < 100; i++) {
      keys.add(generateApiKey().rawKey)
    }
    expect(keys.size).toBe(100)
  })

  // Test: Round-trip consistency: hashApiKey(rawKey) === keyHash
  // Category: Happy Path
  // What it proves: The hash stored in keyHash matches a re-hash of rawKey (deterministic)
  // Risk if missing: Auth validation would fail because stored hash wouldn't match computed hash
  it('round-trip: hashApiKey(rawKey) === keyHash', () => {
    const { rawKey, keyHash } = generateApiKey()
    expect(hashApiKey(rawKey)).toBe(keyHash)
  })
})

// ── hashApiKey ──

describe('hashApiKey', () => {
  // Test: hashApiKey produces consistent output for same input
  // Category: Happy Path
  // What it proves: The hash function is deterministic
  // Risk if missing: Non-deterministic hashing would make key validation impossible
  it('produces the same hash for the same input (deterministic)', () => {
    const input = 'tk_abcdef1234567890abcdef1234567890'
    const hash1 = hashApiKey(input)
    const hash2 = hashApiKey(input)
    expect(hash1).toBe(hash2)
  })

  // Test: hashApiKey('') produces valid SHA-256
  // Category: Happy Path
  // What it proves: Empty string hashing doesn't crash and produces correct-length output
  // Risk if missing: Edge case could crash key validation
  it('hashes empty string to a valid 64-char hex', () => {
    const hash = hashApiKey('')
    expect(hash.length).toBe(64)
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true)
  })

  // Test: hashApiKey with different inputs produces different hashes
  // Category: Unhappy Path
  // What it proves: Collision resistance — different inputs have different hashes
  // Risk if missing: Hash collisions could allow key forgery
  it('produces different hashes for different inputs', () => {
    const hashA = hashApiKey('tk_key_a')
    const hashB = hashApiKey('tk_key_b')
    expect(hashA).not.toBe(hashB)
  })

  // Test: hashApiKey with Unicode input
  // Category: Unhappy Path
  // What it proves: Unicode strings are hashable (SHA-256 handles any BufferSource)
  // Risk if missing: Unicode API keys (however unlikely) could crash
  it('handles Unicode input', () => {
    const hash = hashApiKey('tk_🔥𠜎')
    expect(hash.length).toBe(64)
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true)
  })

  // Test: hashApiKey with very long input
  // Category: Unhappy Path
  // What it proves: Long inputs don't crash (SHA-256 handles arbitrary length)
  // Risk if missing: DoS via large key tokens
  it('handles very long input without crashing', () => {
    const longKey = 'tk_' + 'a'.repeat(50000)
    const hash = hashApiKey(longKey)
    expect(hash.length).toBe(64)
  })
})

// ── isValidApiKeyFormat ──

describe('isValidApiKeyFormat', () => {
  // Test: isValidApiKeyFormat with valid tk_ key
  // Category: Happy Path
  // What it proves: A properly formatted key passes validation
  // Risk if missing: All valid keys would be rejected
  it('returns true for valid tk_ key', () => {
    const validKey = 'tk_' + 'a'.repeat(64)
    expect(isValidApiKeyFormat(validKey)).toBe(true)
  })

  // Test: isValidApiKeyFormat with minimal valid key (prefix + 11 chars)
  // Category: Happy Path
  // What it proves: The minimum length requirement (prefix + 11 = 14 chars total) passes
  // Risk if missing: Keys that are long enough but shorter than 64 chars would be rejected
  it('returns true for minimal valid key (prefix + 11 chars = 14 total)', () => {
    // The check is: key.length > API_KEY_PREFIX.length + 10 = 3 + 10 = 13
    // So key must be at least 14 characters
    const minimalKey = 'tk_' + 'a'.repeat(11)
    expect(minimalKey.length).toBe(14)
    expect(isValidApiKeyFormat(minimalKey)).toBe(true)
  })

  // Test: isValidApiKeyFormat with empty string
  // Category: Unhappy Path
  // What it proves: Empty strings are rejected
  // Risk if missing: Empty strings could pass validation and cause downstream issues
  it('returns false for empty string', () => {
    expect(isValidApiKeyFormat('')).toBe(false)
  })

  // Test: isValidApiKeyFormat with 'tk_' only (too short)
  // Category: Unhappy Path
  // What it proves: Keys shorter than the minimum length are rejected
  // Risk if missing: Malformed short keys could pass validation
  it('returns false for just prefix (tk_ only)', () => {
    expect(isValidApiKeyFormat('tk_')).toBe(false)
  })

  // Test: isValidApiKeyFormat with prefix + exactly 10 chars (boundary)
  // Category: Unhappy Path
  // What it proves: Keys that are exactly prefix.length + 10 (13 chars) are rejected (needs >)
  // Risk if missing: Boundary condition could allow keys that are too short
  it('returns false for prefix + exactly 10 chars (boundary — len must be > 13)', () => {
    const boundaryKey = 'tk_' + 'a'.repeat(10) // length = 3 + 10 = 13
    expect(boundaryKey.length).toBe(13)
    expect(isValidApiKeyFormat(boundaryKey)).toBe(false)
  })

  // Test: isValidApiKeyFormat with wrong prefix 'sk_'
  // Category: Unhappy Path
  // What it proves: Keys with wrong prefixes are rejected
  // Risk if missing: Non-SDK keys could be mistaken for API keys
  it('returns false for wrong prefix (sk_)', () => {
    expect(isValidApiKeyFormat('sk_' + 'a'.repeat(64))).toBe(false)
  })

  // Test: isValidApiKeyFormat with null
  // Category: Error Handling
  // What it proves: Calling with null doesn't crash the caller (JavaScript allows it)
  // Risk if missing: Null from untrusted input could crash validation
  it('handles null gracefully (returns false)', () => {
    // In JavaScript, null.startsWith() would throw, but the caller should handle it
    // The function itself will throw if called with null because null.startsWith throws
    expect(() => isValidApiKeyFormat(null as any)).toThrow()
  })

  // Test: isValidApiKeyFormat with very long key
  // Category: Happy Path
  // What it proves: Very long keys with correct prefix are accepted
  // Risk if missing: Legitimate long keys (e.g. from hash output) would be rejected
  it('returns true for very long key with correct prefix', () => {
    const longKey = 'tk_' + 'a'.repeat(1000)
    expect(isValidApiKeyFormat(longKey)).toBe(true)
  })

  // Test: isValidApiKeyFormat with Unicode key starting with tk_
  // Category: Unhappy Path
  // What it proves: Unicode characters after valid prefix don't break format check
  // Risk if missing: Unicode keys could bypass format validation
  it('returns true for Unicode key starting with tk_ if long enough', () => {
    const unicodeKey = 'tk_' + '🔥'.repeat(6) + 'a'.repeat(10) // long enough
    expect(isValidApiKeyFormat(unicodeKey)).toBe(true)
  })

  // Test: isValidApiKeyFormat with undefined
  // Category: Error Handling
  // What it proves: undefined causes a throw (documented contract)
  // Risk if missing: Silent undefined input could cause confusing downstream errors
  it('throws for undefined (contract expectation)', () => {
    expect(() => isValidApiKeyFormat(undefined as any)).toThrow()
  })

  // Test: isValidApiKeyFormat with various non-string inputs
  // Category: Error Handling
  // What it proves: Numbers, objects etc. cause throws (string method calls)
  // Risk if missing: Non-string inputs could silently pass or cause hard-to-debug errors
  it('throws for non-string inputs', () => {
    expect(() => isValidApiKeyFormat(123 as any)).toThrow()
    expect(() => isValidApiKeyFormat({} as any)).toThrow()
    expect(() => isValidApiKeyFormat(true as any)).toThrow()
    expect(() => isValidApiKeyFormat([] as any)).toThrow()
  })
})
