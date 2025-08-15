interface Token {
	userId: string
	grant: {
		clientId: string
		scope: string
	}
	expiresAt: number
}

export async function getTokenInfo(
	request: Request,
	env: Env,
): Promise<Token | undefined> {
	const token = request.headers.get('authorization')?.slice('Bearer '.length)
	console.log({ token })
	if (!token) return undefined
	return resolveTokenInfo(token, env)
}

async function resolveTokenInfo(
	token: string,
	env: Env,
): Promise<Token | undefined> {
	const parts = token.split(':')
	console.log({ parts })
	if (parts.length !== 3) throw new Error('Invalid token format')

	const [userId, grantId] = parts
	console.log({ userId, grantId })
	const tokenId = await generateTokenId(token)
	const tokenKey = `token:${userId}:${grantId}:${tokenId}`
	console.log({ tokenKey })
	const tokenData = await env.OAUTH_KV.get(tokenKey, { type: 'json' })
	console.log({ tokenData })
	if (!tokenData) throw new Error('Token not found')

	return tokenData as Token
}

// copied from @cloudflare/workers-oauth-provider
async function generateTokenId(token: string) {
	const encoder = new TextEncoder()
	const data = encoder.encode(token)
	const hashBuffer = await crypto.subtle.digest('SHA-256', data)
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
	return hashHex
}
