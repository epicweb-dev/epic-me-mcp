import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { createRequestHandler } from 'react-router'
import { DB } from './db'
import { EpicMeMCP } from './mcp/index.ts'
import { withCors } from './utils/misc.ts'

const requestHandler = createRequestHandler(
	() => import('virtual:react-router/server-build'),
	import.meta.env.MODE,
)

// Default handler for non-MCP routes
const defaultHandler = {
	fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
		return requestHandler(request, {
			db: await DB.getInstance(env),
			cloudflare: { env, ctx },
		})
	},
}

// Create OAuth provider instance
const oauthProvider = new OAuthProvider({
	apiRoute: ['/mcp'],
	apiHandler: {
		// @ts-expect-error
		fetch(request: Request, env: Env, ctx: ExecutionContext) {
			const url = new URL(request.url)
			if (url.pathname === '/mcp') {
				ctx.props.baseUrl = url.origin

				return EpicMeMCP.serve('/mcp', {
					binding: 'EPIC_ME_MCP_OBJECT',
				}).fetch(request, env, ctx)
			}

			return new Response('Not found', { status: 404 })
		},
	},
	// @ts-expect-error
	defaultHandler,
	authorizeEndpoint: '/authorize',
	tokenEndpoint: '/oauth/token',
	clientRegistrationEndpoint: '/oauth/register',
})

export default {
	fetch: withCors({
		getCorsHeaders: (request) => {
			if (request.url.includes('/.well-known')) {
				return {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
					'Access-Control-Allow-Headers': 'mcp-protocol-version',
					'Cross-Origin-Resource-Policy': 'cross-origin',
				}
			}
		},
		handler: async (request: Request, env: Env, ctx: ExecutionContext) => {
			return oauthProvider.fetch(request, env, ctx)
		},
	}),
}

export { EpicMeMCP }
