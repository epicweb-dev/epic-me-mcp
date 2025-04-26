import { type OAuthHelpers } from '@cloudflare/workers-oauth-provider'

export interface Env {
	EPIC_ME_DB: D1Database
	OAUTH_KV: KVNamespace
	OAUTH_PROVIDER: OAuthHelpers
}
