import {
	type OAuthClientProvider,
	auth,
} from '@modelcontextprotocol/sdk/client/auth.js'
import {
	OAuthClientInformationSchema,
	type OAuthClientInformation,
	type OAuthTokens,
	OAuthTokensSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js'

// In-memory storage for testing
const storage = new Map<string, string>()

export class TestOAuthClientProvider implements OAuthClientProvider {
	#serverUrl: string
	#authUrl: URL | null = null

	constructor(serverUrl: string) {
		this.#serverUrl = serverUrl
	}

	get redirectUrl() {
		return 'http://localhost:3000/oauth/callback'
	}

	get clientMetadata() {
		return {
			redirect_uris: [this.redirectUrl],
			token_endpoint_auth_method: 'none',
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			client_name: 'MCP Test Client',
			client_uri: 'http://localhost:3000',
		}
	}

	async clientInformation() {
		const key = `client-info-${this.#serverUrl}`
		const value = storage.get(key)
		if (!value) {
			return undefined
		}

		return await OAuthClientInformationSchema.parseAsync(JSON.parse(value))
	}

	saveClientInformation(clientInformation: OAuthClientInformation) {
		const key = `client-info-${this.#serverUrl}`
		storage.set(key, JSON.stringify(clientInformation))
	}

	async tokens() {
		const key = `tokens-${this.#serverUrl}`
		const tokens = storage.get(key)
		if (!tokens) {
			return undefined
		}

		return await OAuthTokensSchema.parseAsync(JSON.parse(tokens))
	}

	saveTokens(tokens: OAuthTokens) {
		const key = `tokens-${this.#serverUrl}`
		storage.set(key, JSON.stringify(tokens))
	}

	redirectToAuthorization(authorizationUrl: URL) {
		this.#authUrl = authorizationUrl
	}

	saveCodeVerifier(codeVerifier: string) {
		const key = `code-verifier-${this.#serverUrl}`
		storage.set(key, codeVerifier)
	}

	codeVerifier() {
		const key = `code-verifier-${this.#serverUrl}`
		const verifier = storage.get(key)
		if (!verifier) {
			throw new Error('No code verifier saved for test session')
		}
		return verifier
	}

	clear() {
		// Clear all keys related to this server
		for (const key of storage.keys()) {
			if (key.includes(this.#serverUrl)) {
				storage.delete(key)
			}
		}
		this.#authUrl = null
	}

	async completeAuthorization() {
		const result = await auth(this, { serverUrl: this.#serverUrl })
		if (result === 'AUTHORIZED') {
			return true
		} else if (result === 'REDIRECT') {
			if (!this.#authUrl) {
				throw new Error('No authorization URL available')
			}
			// Get the client information to use in the token exchange
			const clientInfo = await this.clientInformation()
			if (!clientInfo) {
				throw new Error('No client information available for token exchange')
			}
			// Make a request to the authorization endpoint to get a real code
			const response = await fetch(this.#authUrl, {
				redirect: 'manual', // Don't follow redirects
			})
			// Check for 302 redirect
			if (response.status !== 302) {
				throw new Error(`Authorization failed: ${response.status}`)
			}

			// Get the authorization code from the Location header
			const redirectUrl = new URL(response.headers.get('Location') || '')
			const code = redirectUrl.searchParams.get('code')
			if (!code) {
				throw new Error('No authorization code received')
			}
			// Make a request to the token endpoint with the code
			const tokenUrl = new URL('/oauth/token', this.#serverUrl)
			const tokenResponse = await fetch(tokenUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					grant_type: 'authorization_code',
					client_id: clientInfo.client_id,
					code,
					code_verifier: await this.codeVerifier(),
					redirect_uri: this.redirectUrl,
				}),
			})
			if (!tokenResponse.ok) {
				throw new Error(`Token exchange failed: ${tokenResponse.status}`)
			}
			const tokens = await OAuthTokensSchema.parseAsync(
				await tokenResponse.json(),
			)
			await this.saveTokens(tokens)
			return true
		} else {
			console.error('Failed to authorize', result)
			throw new Error('Failed to authorize')
		}
	}

	async getAuthHeaders(): Promise<Record<string, string>> {
		const tokens = await this.tokens()
		if (!tokens?.access_token) {
			return {}
		}
		return {
			Authorization: `Bearer ${tokens.access_token}`,
		}
	}
}
