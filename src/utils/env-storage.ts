import { AsyncLocalStorage } from 'async_hooks'
import { type OAuthHelpers } from '@cloudflare/workers-oauth-provider'

export interface Env extends Cloudflare.Env {
	OAUTH_PROVIDER: OAuthHelpers
}

export const envStorage = new AsyncLocalStorage<Env>()
