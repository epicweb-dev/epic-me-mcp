/// <reference path="../types/worker-configuration.d.ts" />

import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { invariant } from '@epic-web/invariant'
import {
	McpServer,
	type RegisteredResourceTemplate,
	type RegisteredResource,
	type RegisteredTool,
	type RegisteredPrompt,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import { type Connection } from 'agents'
import { McpAgent } from 'agents/mcp'
import { DB } from './db'
import { initializePrompts } from './prompts.ts'
import { initializeResources } from './resources.ts'
import { initializeTools } from './tools.ts'
import { envStorage, type Env } from './utils/env-storage.ts'

type State = { userId: number | null }
type Props = { grantId: string; grantUserId: string }

export class EpicMeMCP extends McpAgent<Env, State, Props> {
	db!: DB
	initialState = { userId: null }
	unauthenticatedTools: Array<RegisteredTool> = []
	authenticatedTools: Array<RegisteredTool> = []
	unauthenticatedResources: Array<
		RegisteredResource | RegisteredResourceTemplate
	> = []
	authenticatedResources: Array<
		RegisteredResource | RegisteredResourceTemplate
	> = []
	authenticatedPrompts: Array<RegisteredPrompt> = []
	server = new McpServer(
		{
			name: 'EpicMe',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {
					listChanged: true,
				},
				resources: {
					subscribe: true,
					listChanged: true,
				},
				completions: {},
				prompts: {
					listChanged: true,
				},
				logging: {},
			},
			instructions: `
EpicMe is a journaling app that allows users to write about and review their experiences, thoughts, and reflections.

These tools are the user's window into their journal. With these tools and your help, they can create, read, and manage their journal entries and associated tags.

You can also help users add tags to their entries and get all tags for an entry.
`.trim(),
		},
	)
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)

		// Initialize database with migrations
		void ctx.blockConcurrencyWhile(async () => {
			this.db = await DB.getInstance(env)
		})
	}

	async init() {
		envStorage.enterWith(this.env)
		const user = await this.db.getUserByGrantId(this.props.grantId)
		this.setState({ userId: user?.id ?? null })
		await initializeTools(this)
		await initializeResources(this)
		await initializePrompts(this)
	}

	onStateUpdate(state: State | undefined, source: Connection | 'server') {
		const result = super.onStateUpdate(state, source)
		if (source === 'server') {
			void this.updateAvailableItems()
		}
		return result
	}

	async requireUser() {
		const { grantId } = this.props
		invariant(grantId, 'You must be logged in to perform this action')
		const user = await this.db.getUserByGrantId(grantId)
		invariant(
			user,
			`No user found with the given grantId. Please claim the grant by invoking the "authenticate" tool.`,
		)
		return user
	}

	async updateAvailableItems() {
		// No clients seem to support this yet...
		const clientSupport = false
		if (!clientSupport) return

		let user = this.state.userId
			? await this.db.getUserById(this.state.userId)
			: null
		for (const tool of this.unauthenticatedTools) {
			if (user && tool.enabled) tool.disable()
			else if (!user && !tool.enabled) tool.enable()
		}
		for (const tool of this.authenticatedTools) {
			if (user && !tool.enabled) tool.enable()
			else if (!user && tool.enabled) tool.disable()
		}
		for (const resource of this.authenticatedResources) {
			if (user && !resource.enabled) resource.enable()
			else if (!user && resource.enabled) resource.disable()
		}
		for (const resource of this.unauthenticatedResources) {
			if (user && !resource.enabled) resource.enable()
			else if (!user && resource.enabled) resource.disable()
		}
		for (const prompt of this.authenticatedPrompts) {
			if (user && !prompt.enabled) prompt.enable()
			else if (!user && prompt.enabled) prompt.disable()
		}
	}
}

// Default handler for non-MCP routes
const defaultHandler = {
	fetch: async (request: Request, env: Env) => {
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

				const db = await DB.getInstance(env)
				const grantUserId = crypto.randomUUID()
				const grantId = await db.createUnclaimedGrant(grantUserId)

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

		// Default response for non-authorization requests
		return new Response('Not Found', { status: 404 })
	},
}

// Create OAuth provider instance
const oauthProvider = new OAuthProvider({
	apiRoute: ['/mcp', '/sse'],
	apiHandler: {
		// @ts-expect-error
		fetch(request: Request, env: Env, ctx: ExecutionContext) {
			const url = new URL(request.url)

			if (url.pathname === '/sse' || url.pathname === '/sse/message') {
				return EpicMeMCP.serveSSE('/sse', {
					binding: 'EPIC_ME_MCP_OBJECT',
				}).fetch(request, env, ctx)
			}

			if (url.pathname === '/mcp') {
				return EpicMeMCP.serve('/mcp', { binding: 'EPIC_ME_MCP_OBJECT' }).fetch(
					request,
					env,
					ctx,
				)
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
	fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
		return envStorage.run(env, () => oauthProvider.fetch(request, env, ctx))
	},
}
