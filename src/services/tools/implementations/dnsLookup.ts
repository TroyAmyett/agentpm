// DNS Lookup Tool
// Performs DNS lookups using Cloudflare's DNS over HTTPS API

import type { ToolResult } from '../types'

interface DnsRecord {
  name: string
  type: number
  ttl: number
  data: string
}

interface DnsLookupResult {
  domain: string
  recordType: string
  records: DnsRecord[]
  status: string
}

// DNS record type codes
const DNS_TYPES: Record<string, number> = {
  A: 1,
  AAAA: 28,
  CNAME: 5,
  MX: 15,
  NS: 2,
  TXT: 16,
  ANY: 255,
}

const DNS_TYPE_NAMES: Record<number, string> = {
  1: 'A',
  28: 'AAAA',
  5: 'CNAME',
  15: 'MX',
  2: 'NS',
  16: 'TXT',
  6: 'SOA',
}

// DNS status codes
const DNS_STATUS: Record<number, string> = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
}

/**
 * Validate domain format
 */
function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/
  return domainRegex.test(domain)
}

/**
 * Normalize domain name
 */
function normalizeDomain(domain: string): string {
  let normalized = domain.toLowerCase().trim()
  normalized = normalized.replace(/^https?:\/\//, '')
  normalized = normalized.replace(/^www\./, '')
  normalized = normalized.split('/')[0]
  return normalized
}

/**
 * Perform DNS lookup
 */
export async function dnsLookup(
  domain: string,
  recordType: string = 'A'
): Promise<ToolResult> {
  const startTime = Date.now()

  if (!domain) {
    return {
      success: false,
      error: 'No domain provided',
      metadata: { executionTimeMs: Date.now() - startTime },
    }
  }

  const normalizedDomain = normalizeDomain(domain)

  if (!isValidDomain(normalizedDomain)) {
    return {
      success: false,
      error: 'Invalid domain format',
      metadata: { executionTimeMs: Date.now() - startTime },
    }
  }

  const typeCode = DNS_TYPES[recordType.toUpperCase()] || DNS_TYPES.A

  try {
    // Use Cloudflare's DNS over HTTPS API
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(normalizedDomain)}&type=${typeCode}`,
      {
        headers: {
          Accept: 'application/dns-json',
        },
      }
    )

    if (!response.ok) {
      return {
        success: false,
        error: `DNS lookup failed: ${response.status}`,
        metadata: { executionTimeMs: Date.now() - startTime },
      }
    }

    const data = await response.json()

    const result: DnsLookupResult = {
      domain: normalizedDomain,
      recordType: recordType.toUpperCase(),
      status: DNS_STATUS[data.Status] || `Unknown (${data.Status})`,
      records: [],
    }

    if (data.Answer && data.Answer.length > 0) {
      result.records = data.Answer.map((answer: { name: string; type: number; TTL: number; data: string }) => ({
        name: answer.name,
        type: DNS_TYPE_NAMES[answer.type] || answer.type,
        ttl: answer.TTL,
        data: answer.data,
      }))
    }

    // Format for agent output
    let formattedOutput = `DNS Lookup for ${normalizedDomain} (${recordType}):\n`
    formattedOutput += `Status: ${result.status}\n`

    if (result.records.length > 0) {
      formattedOutput += `\nRecords found:\n`
      for (const record of result.records) {
        formattedOutput += `  ${record.type}: ${record.data} (TTL: ${record.ttl}s)\n`
      }
    } else {
      formattedOutput += `\nNo records found for this record type.`
    }

    return {
      success: true,
      data: {
        ...result,
        formatted: formattedOutput,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        source: 'cloudflare-dns',
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `DNS lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: { executionTimeMs: Date.now() - startTime },
    }
  }
}
