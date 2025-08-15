import { invariant } from '@epic-web/invariant'
import {
	McpServer,
	type RegisteredPrompt,
	type RegisteredResource,
	type RegisteredResourceTemplate,
	type RegisteredTool,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import {
	SetLevelRequestSchema,
	type LoggingLevel,
} from '@modelcontextprotocol/sdk/types.js'
import { type Connection } from 'agents'
import { McpAgent } from 'agents/mcp'
import { DB } from '../db'
import { initializePrompts } from './prompts.ts'
import { initializeResources } from './resources.ts'
import { initializeTools } from './tools.ts'

type State = { loggingLevel: LoggingLevel }
type Props = { grantId: string; grantUserId: string; baseUrl: string }

export class EpicMeMCP extends McpAgent<Env, State, Props> {
	db!: DB
	initialState = { loggingLevel: 'info' as const }
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
		this.setState({ ...this.state })

		this.server.server.setRequestHandler(
			SetLevelRequestSchema,
			async (request) => {
				this.setState({ ...this.state, loggingLevel: request.params.level })
				return {}
			},
		)

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

		const user = await this.db.getUserByGrantId(this.props.grantId)

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
