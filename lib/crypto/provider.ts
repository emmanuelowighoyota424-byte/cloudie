export type CryptoDeposit = { id: string; asset: string; network: string; address: string | null; expectedAmount: string | null; txHash: string | null; confirmations: number; status: string }

export interface CryptoProvider {
  createDepositAddress(input: { customerId: string; asset: string; network: string }): Promise<{ address: string; reference?: string }>
  getDepositStatus(input: { reference?: string; txHash?: string }): Promise<CryptoDeposit>
  verifyTransaction(input: { txHash: string; asset: string; network: string; expectedAmount?: string }): Promise<CryptoDeposit>
  normalizeWebhook(payload: unknown): { eventId: string; reference?: string; txHash?: string; status: string } | null
}

class ConfiguredHttpCryptoProvider implements CryptoProvider {
  constructor(private readonly baseUrl: string, private readonly apiKey: string) {}
  private async call(path: string, body: unknown) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) throw new Error(`Crypto provider request failed (${response.status})`)
    return response.json() as Promise<Record<string, unknown>>
  }
  async createDepositAddress(input: { customerId: string; asset: string; network: string }) { const data = await this.call('/deposits/address', input); if (typeof data.address !== 'string') throw new Error('Crypto provider returned no deposit address'); return { address: data.address, reference: typeof data.reference === 'string' ? data.reference : undefined } }
  async getDepositStatus(input: { reference?: string; txHash?: string }) { return this.call('/deposits/status', input) as Promise<CryptoDeposit> }
  async verifyTransaction(input: { txHash: string; asset: string; network: string; expectedAmount?: string }) { return this.call('/deposits/verify', input) as Promise<CryptoDeposit> }
  normalizeWebhook(payload: unknown) { const value = payload as Record<string, unknown>; if (typeof value.eventId !== 'string' || typeof value.status !== 'string') return null; return { eventId: value.eventId, reference: typeof value.reference === 'string' ? value.reference : undefined, txHash: typeof value.txHash === 'string' ? value.txHash : undefined, status: value.status } }
}

export function getCryptoProvider(): CryptoProvider {
  const baseUrl = process.env.CRYPTO_PROVIDER_URL
  const apiKey = process.env.CRYPTO_PROVIDER_KEY
  if (!baseUrl || !apiKey) throw new Error('Crypto provider is not configured')
  return new ConfiguredHttpCryptoProvider(baseUrl, apiKey)
}
