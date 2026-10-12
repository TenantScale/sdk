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

// ──────────────────────────────────────────────────────
// SSRF Protection — blocks requests to internal/private networks
// ──────────────────────────────────────────────────────

import { lookup } from 'node:dns/promises'
import ipaddr from 'ipaddr.js'

// Private/reserved IPv4 ranges a server must never fetch from.
const ILLEGAL_IPV4 = [
  '0.0.0.0/8', // current network
  '10.0.0.0/8', // private
  '100.64.0.0/10', // carrier-grade NAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local (incl. cloud metadata 169.254.169.254)
  '172.16.0.0/12', // private
  '192.168.0.0/16', // private
  '198.18.0.0/15', // benchmarking
  '198.51.100.0/24', // documentation
  '203.0.113.0/24', // documentation
  '240.0.0.0/4', // reserved/future
]

// Private/reserved IPv6 ranges a server must never fetch from.
const ILLEGAL_IPV6 = [
  '::/128', // unspecified
  '::1/128', // loopback
  'fc00::/7', // unique-local (ULA)
  'fe80::/10', // link-local
  'ff00::/8', // multicast
  '2001:db8::/32', // documentation
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

/**
 * True if an IP is private/reserved (IPv4 or IPv6). IPv4-mapped IPv6 addresses
 * (`::ffff:a.b.c.d`) are reclassified as IPv4 and checked against the IPv4
 * ranges. An address that cannot be parsed is treated as unsafe.
 */
export function isPrivateIp(ip: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6
  try {
    parsed = ipaddr.parse(ip)
  } catch {
    return true // unparsable — safer to treat as restricted
  }

  if (parsed.kind() === 'ipv4') {
    return ILLEGAL_IPV4.some((cidr) => {
      const [range, bits] = ipaddr.parseCIDR(cidr)
      return (parsed as ipaddr.IPv4).match(range as ipaddr.IPv4, bits)
    })
  }

  const v6 = parsed as ipaddr.IPv6
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) — reclassify as IPv4.
  if (v6.isIPv4MappedAddress()) {
    return isPrivateIp(v6.toIPv4Address().toString())
  }

  return ILLEGAL_IPV6.some((cidr) => {
    const [range, bits] = ipaddr.parseCIDR(cidr)
    return v6.match(range as ipaddr.IPv6, bits)
  })
}

/** A validated URL plus the single public IP the caller should connect to. */
export interface PinnedWebhookUrl {
  url: URL
  ip: string
}

/**
 * Resolve and validate a URL, returning the validated URL and the list of
 * public IPs it resolved to. Throws if the target is restricted or cannot be
 * validated (fail closed). Never returns a private/reserved address.
 */
async function resolveValidated(urlStr: string): Promise<{ url: URL; ips: string[] }> {
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

  // IPv6 literal (URL.hostname renders it bracketed, e.g. "[2001:db8::1]").
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    const v6Literal = hostname.slice(1, -1)
    if (isPrivateIp(v6Literal)) {
      throw new Error(`Blocked private IP: ${hostname}`)
    }
    return { url, ips: [v6Literal] }
  }

  // IPv4 literal.
  const ipv4Match = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/)
  if (ipv4Match) {
    if (isPrivateIp(hostname)) {
      throw new Error(`Blocked private IP: ${hostname}`)
    }
    return { url, ips: [hostname] }
  }

  // Hostname → resolve DNS and check ALL resolved addresses (IPv4 and IPv6).
  // Fail closed: if we cannot resolve/validate the target, reject it.
  let resolvedIps: string[]
  try {
    const addresses = await lookup(hostname)
    resolvedIps = Array.isArray(addresses) ? addresses.map((a) => a.address) : [addresses.address]
  } catch (err) {
    throw new Error(
      `Failed to resolve ${hostname} for SSRF validation: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  for (const ip of resolvedIps) {
    if (isPrivateIp(ip)) {
      throw new Error(`Blocked private/resolved IP for ${hostname}: ${ip}`)
    }
  }

  if (resolvedIps.length === 0) {
    throw new Error(`No addresses resolved for ${hostname}`)
  }

  return { url, ips: resolvedIps }
}

/**
 * Validate that a URL is safe to fetch from the server.
 * Blocks private/reserved IPs (IPv4 and IPv6), loopback, link-local, metadata
 * endpoints, and unreachable/DNS-failing targets.
 *
 * @param urlStr - The URL to validate
 * @returns The validated URL object if safe
 * @throws Error if the URL is unsafe
 */
export async function validateWebhookUrl(urlStr: string): Promise<URL> {
  const { url } = await resolveValidated(urlStr)
  return url
}

/**
 * Like `validateWebhookUrl`, but also returns the resolved public IP the caller
 * should use for the outbound connection. Connecting to this pinned IP (rather
 * than re-resolving the hostname) prevents DNS-rebinding attacks where a
 * hostname answers validation with a public IP but the real request with a
 * private one.
 *
 * @throws Error if the URL is unsafe or resolves to no public address
 */
export async function validateWebhookUrlPinned(urlStr: string): Promise<PinnedWebhookUrl> {
  const { url, ips } = await resolveValidated(urlStr)
  return { url, ip: ips[0] }
}
