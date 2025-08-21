// ensure the module is in the program so the merge hits
import 'cloudflare:workers'
import { type DB } from '#worker/db/index.ts'
import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

declare global {
	namespace Cloudflare {
		interface Env {
			OAUTH_PROVIDER: OAuthHelpers
			RESEND_API_KEY: string
			MOCKS?: string
		}
	}
}

export {}

interface EpicExecutionContext extends ExecutionContext {
	props: {
		baseUrl: string
	}
}

declare module 'react-router' {
	export interface AppLoadContext {
		db: DB
		cloudflare: {
			env: Env
			ctx: EpicExecutionContext
		}
	}
}
