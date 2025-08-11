// ensure the module is in the program so the merge hits
import 'cloudflare:workers'

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
