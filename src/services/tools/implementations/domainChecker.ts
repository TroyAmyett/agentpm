// Domain Availability Checker Tool
// Checks if domains are available for registration using DNS and availability APIs

import type { ToolResult } from '../types'

interface DomainCheckResult {
  domain: string
  available: boolean
  registrar?: string
  expiresAt?: string
  error?: string
}

interface DomainCheckResponse {
  results: DomainCheckResult[]
  checkedAt: string
}

/**
 * Validate domain format
 */
function isValidDomain(domain: string): boolean {
  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/
  return domainRegex.test(domain)
}

/**
 * Normalize domain name (remove protocol, www, trailing slashes)
 */
function normalizeDomain(domain: string): string {
  let normalized = domain.toLowerCase().trim()

  // Remove protocol
  normalized = normalized.replace(/^https?:\/\//, '')

  // Remove www.
  normalized = normalized.replace(/^www\./, '')

  // Remove trailing slash and path
  normalized = normalized.split('/')[0]

  return normalized
}

/**
 * Check domain availability using DNS lookup
 * If DNS resolves, domain is likely taken
 * This is a heuristic - some registered domains may not have DNS records
 */
async function checkViaDns(domain: string): Promise<{ exists: boolean; error?: string }> {
  try {
    // Use Cloudflare's DNS over HTTPS API
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`,
      {
        headers: {
          Accept: 'application/dns-json',
        },
      }
    )

    if (!response.ok) {
      return { exists: false, error: 'DNS lookup failed' }
    }

    const data = await response.json()

    // If we get Answer records, domain has DNS and is likely taken
    if (data.Answer && data.Answer.length > 0) {
      return { exists: true }
    }

    // Check for NXDOMAIN (domain doesn't exist)
    // Status 3 = NXDOMAIN
    if (data.Status === 3) {
      return { exists: false }
    }

    // Other statuses are ambiguous
    return { exists: false }
  } catch {
    return { exists: false, error: 'DNS lookup error' }
  }
}

/**
 * Check domain availability using RDAP (Registration Data Access Protocol)
 * RDAP is the modern replacement for WHOIS
 */
async function checkViaRdap(domain: string): Promise<{ available: boolean; registrar?: string; expiresAt?: string; error?: string }> {
  try {
    // Extract TLD to find the right RDAP server
    const tld = domain.split('.').pop()?.toLowerCase()

    // Common RDAP bootstrap endpoints
    const rdapServers: Record<string, string> = {
      com: 'https://rdap.verisign.com/com/v1',
      net: 'https://rdap.verisign.com/net/v1',
      org: 'https://rdap.publicinterestregistry.org/rdap',
      io: 'https://rdap.nic.io',
      co: 'https://rdap.nic.co',
      dev: 'https://rdap.nic.google',
      app: 'https://rdap.nic.google',
      ai: 'https://rdap.nic.ai',
    }

    const rdapServer = tld ? rdapServers[tld] : null

    if (!rdapServer) {
      // Fall back to DNS-only check for unsupported TLDs
      return { available: false, error: `RDAP not supported for .${tld}` }
    }

    const response = await fetch(`${rdapServer}/domain/${domain}`, {
      headers: {
        Accept: 'application/rdap+json',
      },
    })

    if (response.status === 404) {
      // Domain not found = available
      return { available: true }
    }

    if (!response.ok) {
      return { available: false, error: `RDAP error: ${response.status}` }
    }

    const data = await response.json()

    // Extract useful info
    const registrar = data.entities?.find((e: { roles?: string[] }) =>
      e.roles?.includes('registrar')
    )?.vcardArray?.[1]?.find((v: [string, ...unknown[]]) => v[0] === 'fn')?.[3]

    const expirationEvent = data.events?.find((e: { eventAction?: string }) =>
      e.eventAction === 'expiration'
    )
    const expiresAt = expirationEvent?.eventDate

    return {
      available: false,
      registrar,
      expiresAt,
    }
  } catch {
    return { available: false, error: 'RDAP lookup error' }
  }
}

/**
 * Check multiple domains for availability
 */
export async function checkDomainAvailability(
  domains: string[]
): Promise<ToolResult> {
  const startTime = Date.now()

  if (!domains || domains.length === 0) {
    return {
      success: false,
      error: 'No domains provided',
      metadata: { executionTimeMs: Date.now() - startTime },
    }
  }

  // Limit to prevent abuse
  const maxDomains = 10
  const domainsToCheck = domains.slice(0, maxDomains)

  const results: DomainCheckResult[] = []

  for (const rawDomain of domainsToCheck) {
    const domain = normalizeDomain(rawDomain)

    if (!isValidDomain(domain)) {
      results.push({
        domain,
        available: false,
        error: 'Invalid domain format',
      })
      continue
    }

    // Try RDAP first (more authoritative)
    const rdapResult = await checkViaRdap(domain)

    if (rdapResult.available) {
      // Double-check with DNS
      const dnsResult = await checkViaDns(domain)

      if (dnsResult.exists) {
        // DNS says it exists, but RDAP says available
        // This could be a domain with DNS but expired/pending delete
        results.push({
          domain,
          available: false,
          error: 'Domain has DNS records but may be expiring',
        })
      } else {
        results.push({
          domain,
          available: true,
        })
      }
    } else if (rdapResult.error && rdapResult.error.includes('not supported')) {
      // RDAP not available for this TLD, use DNS only
      const dnsResult = await checkViaDns(domain)
      results.push({
        domain,
        available: !dnsResult.exists,
        error: dnsResult.exists ? undefined : `DNS check only (RDAP unavailable for this TLD)`,
      })
    } else {
      results.push({
        domain,
        available: false,
        registrar: rdapResult.registrar,
        expiresAt: rdapResult.expiresAt,
      })
    }
  }

  // Format the response for the agent
  const availableCount = results.filter(r => r.available).length
  const summary = availableCount > 0
    ? `Found ${availableCount} available domain(s)!`
    : 'No available domains found in this batch.'

  const formattedResults = results.map(r => {
    if (r.available) {
      return `  ${r.domain}: AVAILABLE`
    } else if (r.error) {
      return `  ${r.domain}: TAKEN (${r.error})`
    } else {
      const details = []
      if (r.registrar) details.push(`registrar: ${r.registrar}`)
      if (r.expiresAt) details.push(`expires: ${r.expiresAt}`)
      return `  ${r.domain}: TAKEN${details.length ? ` (${details.join(', ')})` : ''}`
    }
  }).join('\n')

  const response: DomainCheckResponse & { summary: string; formatted: string } = {
    results,
    checkedAt: new Date().toISOString(),
    summary,
    formatted: `Domain Availability Check Results:\n${summary}\n\n${formattedResults}`,
  }

  return {
    success: true,
    data: response,
    metadata: {
      executionTimeMs: Date.now() - startTime,
      source: 'rdap+dns',
    },
  }
}
