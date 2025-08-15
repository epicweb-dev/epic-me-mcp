// this is a little unusual... Normally you'd redirect the user to login and then
// on this page you would show them a UI to accept the OAuth request for their
// account. Instead, we automatically accept the OAuth request, but we're really
// just creating an "unclaimed" grant which will be claimed later by the user
// when they claim it by providing a validation token.

import { type Route } from './+types/authorize.ts'

export async function loader({ request, context }: Route.LoaderArgs) {
	const { env } = context.cloudflare
	const url = new URL(request.url)
	if (url.pathname.endsWith('/authorize')) {
		try {
			const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request)

			const client = await env.OAUTH_PROVIDER.lookupClient(
				oauthReqInfo.clientId,
			)
			if (!client) {
				return new Response('Invalid client', { status: 400 })
			}

			const grantUserId = crypto.randomUUID()
			const grantId = await context.db.createUnclaimedGrant(grantUserId)

			const result = await env.OAUTH_PROVIDER.completeAuthorization({
				request: oauthReqInfo,
				// Here's one of the hacks. We don't know who the user is yet since the token at
				// this point is unclaimed. But completeAuthorization expects a userId.
				// So we'll generate a random UUID as a temporary userId
				userId: grantUserId,
				props: { grantId, grantUserId },
				scope: ['full'],
				metadata: { grantDate: new Date().toISOString() },
			})

			// Redirect to the client with the authorization code
			return Response.redirect(result.redirectTo)
		} catch (error) {
			console.error('Authorization error:', error)
			return new Response(
				error instanceof Error ? error.message : 'Authorization failed',
				{ status: 400 },
			)
		}
	}
}
