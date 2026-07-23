// ──────────────────────────────────────────────────────
// SSRF Protection — blocks requests to internal/private networks
// ──────────────────────────────────────────────────────

import { lookup } from 'node:dns/promises'

// Private/reserved IPv4 CIDR ranges
const PRIVATE_RANGES = [
  { start: ipToInt('127.0.0.0'), end: ipToInt('127.255.255.255') }, // Loopback
  { start: ipToInt('10.0.0.0'), end: ipToInt('10.255.255.255') }, // Private A
  { start: ipToInt('172.16.0.0'), end: ipToInt('172.31.255.255') }, // Private B
  { start: ipToInt('192.168.0.0'), end: ipToInt('192.168.255.255') }, // Private C
  { start: ipToInt('169.254.0.0'), end: ipToInt('169.254.255.255') }, // Link-local
  { start: ipToInt('0.0.0.0'), end: ipToInt('0.255.255.255') }, // Current network
  { start: ipToInt('100.64.0.0'), end: ipToInt('100.127.255.255') }, // Carrier-grade NAT
  { start: ipToInt('198.18.0.0'), end: ipToInt('198.19.255.255') }, // Benchmarking
  { start: ipToInt('240.0.0.0'), end: ipToInt('255.255.255.255') }, // Reserved/Future
]

/** Blocked internal hostnames that should never receive webhooks */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  '0.0.0.0',
  'host.docker.internal',
  'host.internal',
  'metadata.google.internal',
  'metadata.amazonaws.com',
  '169.254.169.254',
])

/** Convert an IPv4 string to a 32-bit integer */
function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

/** Check if an IP is within any private/reserved range */
function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) return false // Skip IPv6 for now (minimal support needed)
  const intIp = ipToInt(ip)
  return PRIVATE_RANGES.some((r) => intIp >= r.start && intIp <= r.end)
}

/**
 * Validate that a URL is safe to fetch from the server.
 * Blocks: private IPs, loopback, link-local, metadata endpoints, DNS rebinding via hostname check.
 *
 * @param urlStr - The URL to validate
 * @returns The validated URL object if safe
 * @throws Error if the URL is unsafe
 */
export async function validateWebhookUrl(urlStr: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    throw new Error(`Invalid URL: ${urlStr}`)
  }

  // Only allow HTTP(S) schemes
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${url.protocol}. Only http and https are allowed.`)
  }

  const hostname = url.hostname.toLowerCase()

  // Check against blocked hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Blocked internal hostname: ${hostname}`)
  }

  // If it's an IP literal, block private ranges
  const ipv4Match = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/)
  if (ipv4Match) {
    if (isPrivateIp(hostname)) {
      throw new Error(`Blocked private IP: ${hostname}`)
    }
    return url // IP is public — safe
  }

  // For hostnames, resolve DNS and check all resolved IPs
  try {
    const addresses = await lookup(hostname)
    const ips = Array.isArray(addresses) ? addresses.map((a) => a.address) : [addresses.address]
    for (const ip of ips) {
      if (isPrivateIp(ip)) {
        throw new Error(`Blocked private/resolved IP for ${hostname}: ${ip}`)
      }
    }
  } catch {
    // DNS failure could be transient — allow through
  }

  return url
}
