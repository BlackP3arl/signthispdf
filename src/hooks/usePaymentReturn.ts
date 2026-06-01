import { useEffect, useState } from 'react'
import { verifyCheckoutSession } from '../lib/payment'

export function usePaymentReturn() {
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const payment = params.get('payment')
    const localId = params.get('local_id')

    if (payment === 'cancelled') {
      setPaymentMessage('Checkout cancelled. You can try again anytime.')
      window.history.replaceState({}, '', window.location.pathname)
      return
    }

    if (payment !== 'success' || !localId) return

    setVerifying(true)
    verifyCheckoutSession(localId)
      .then(() => {
        setPaymentMessage('Payment successful. You can generate one AI signature this session.')
        document.getElementById('sign')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      .catch(() => {
        setPaymentMessage('Payment could not be verified. Please contact support if you were charged.')
      })
      .finally(() => {
        setVerifying(false)
        window.history.replaceState({}, '', window.location.pathname)
      })
  }, [])

  return { paymentMessage, verifying }
}
