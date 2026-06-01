export interface Env {
  ASSETS: Fetcher
  ENTITLEMENTS: KVNamespace
  // secrets
  BML_API_KEY: string
  OPENROUTER_API_KEY: string
  ENTITLEMENT_SECRET: string
  // optional secret
  BML_APP_ID?: string
  // vars
  BML_MODE: string
  APP_URL: string
  APP_ALLOWED_ORIGINS?: string
  OPENROUTER_IMAGE_MODEL?: string
}
