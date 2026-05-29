import Stripe from 'stripe'

const PLAN_AMOUNT_CENTS = 100
const PLAN_NAME = 'Just Once — AI Signature'

export function getStripe(env: Record<string, string>): Stripe | null {
  const key = env.STRIPE_SECRET_KEY?.trim()
  if (!key) return null
  return new Stripe(key)
}

export function getAppOrigin(env: Record<string, string>, requestOrigin: string): string {
  return env.VITE_APP_URL?.trim() || requestOrigin
}

export async function createJustOnceCheckout(
  stripe: Stripe,
  env: Record<string, string>,
  requestOrigin: string,
): Promise<string> {
  const appOrigin = getAppOrigin(env, requestOrigin)
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: PLAN_AMOUNT_CENTS,
          product_data: {
            name: PLAN_NAME,
            description:
              'One AI signature generation this session. Sign unlimited PDFs with that signature.',
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${appOrigin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appOrigin}/?payment=cancelled`,
    metadata: { plan: 'just_once' },
  })

  if (!session.url) throw new Error('Stripe did not return a checkout URL')
  return session.url
}

export async function verifyJustOncePayment(
  stripe: Stripe,
  sessionId: string,
): Promise<{ paid: boolean; sessionId: string }> {
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  const paid = session.payment_status === 'paid' && session.status === 'complete'
  return { paid, sessionId: session.id }
}
