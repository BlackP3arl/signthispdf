import type { Env } from '../env'

const SANDBOX = 'https://api.uat.merchants.bankofmaldives.com.mv/public/'
const PRODUCTION = 'https://api.merchants.bankofmaldives.com.mv/public/'

export function bmlBaseUrl(mode: string): string {
  return mode === 'sandbox' ? SANDBOX : PRODUCTION
}

export async function sha1Signature(amount: number, currency: string, apiKey: string): Promise<string> {
  const message = `amount=${amount}&currency=${currency}&apiKey=${apiKey}`
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(message))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type BmlTransaction = { id: string; state: string; url?: string }

export async function createTransaction(
  env: Env,
  params: { amount: number; currency: string; localId: string; redirectUrl: string },
): Promise<BmlTransaction> {
  const signature = await sha1Signature(params.amount, params.currency, env.BML_API_KEY)
  const body: Record<string, unknown> = {
    amount: params.amount,
    currency: params.currency,
    localId: params.localId,
    redirectUrl: params.redirectUrl,
    provider: 'card',
    signMethod: 'sha1',
    apiVersion: '2.0',
    signature,
  }
  if (env.BML_APP_ID) body.deviceId = env.BML_APP_ID

  const res = await fetch(`${bmlBaseUrl(env.BML_MODE)}transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: env.BML_API_KEY,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`BML create failed (${res.status})`)
  return (await res.json()) as BmlTransaction
}

export async function getTransaction(env: Env, id: string): Promise<BmlTransaction> {
  const res = await fetch(`${bmlBaseUrl(env.BML_MODE)}transactions/${id}`, {
    headers: { Accept: 'application/json', Authorization: env.BML_API_KEY },
  })
  if (!res.ok) throw new Error(`BML get failed (${res.status})`)
  return (await res.json()) as BmlTransaction
}

export function isPaid(txn: BmlTransaction): boolean {
  return txn.state === 'CONFIRMED'
}
