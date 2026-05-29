const TOKEN_KEY = 'signpdf:entitlement_token'
const GENERATION_USED_KEY = 'signpdf:ai_generation_used'
const SAVED_SIGNATURE_KEY = 'signpdf:ai_saved_signature'

export function getEntitlementToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setEntitlementToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function isGenerationUsed(): boolean {
  return sessionStorage.getItem(GENERATION_USED_KEY) === 'true'
}

export function markGenerationUsed() {
  sessionStorage.setItem(GENERATION_USED_KEY, 'true')
}

export function hasPaidAccess(): boolean {
  return !!getEntitlementToken()
}

export function getSavedAiSignature(): string | null {
  return sessionStorage.getItem(SAVED_SIGNATURE_KEY)
}

export function saveAiSignature(dataUrl: string) {
  sessionStorage.setItem(SAVED_SIGNATURE_KEY, dataUrl)
}

export function clearAiSession() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(GENERATION_USED_KEY)
  sessionStorage.removeItem(SAVED_SIGNATURE_KEY)
}
