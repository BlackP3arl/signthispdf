// After a successful payment the clean (unwatermarked) AI signature is stored
// for the session so the user can place it on unlimited PDFs until they close
// the tab. There is no client-held entitlement token: the paid BML transaction
// is the entitlement, enforced server-side.
const SAVED_SIGNATURE_KEY = 'signpdf:ai_saved_signature'

export function getSavedAiSignature(): string | null {
  return sessionStorage.getItem(SAVED_SIGNATURE_KEY)
}

export function saveAiSignature(dataUrl: string) {
  sessionStorage.setItem(SAVED_SIGNATURE_KEY, dataUrl)
}

export function hasPaidAccess(): boolean {
  return !!getSavedAiSignature()
}

export function clearAiSession() {
  sessionStorage.removeItem(SAVED_SIGNATURE_KEY)
}
