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
export type Props = { grantId: string; grantUserId: string; baseUrl: string }

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
EpicMe: Personal journaling server with AI-powered organization.

## Authentication Required
Always call \`whoami\` first. If unauthenticated: 1) \`authenticate\` with email, 2) \`validate_token\` with 6-digit code.

## Core Workflow
- Create: \`create_entry\` → \`list_tags\` → \`create_tag\` (if needed) → \`add_tag_to_entry\`
- Browse: \`list_entries\` or \`view_journal\` (MCP-UI clients)
- Organize: \`get_tag_suggestions_instructions\` for AI suggestions
- Analyze: \`get_journal_insights_instructions\` for patterns/summaries

## Best Practices
- Check \`list_tags\` before creating new tags to avoid duplicates
- Use \`list_entries\` to find specific entry IDs before \`get_entry\`
- Prefer MCP prompts (\`suggest_tags\`, \`summarize_journal_entries\`) over instruction tools when available

## Common Requests
- "Write in my journal" → \`create_entry\`
- "Show me my entries" → \`list_entries\` or \`view_journal\`
- "Organize my entries" → \`list_tags\` then \`create_tag\` and \`add_tag_to_entry\`
- "Suggest tags for this entry" → \`get_tag_suggestions_instructions\`
- "Summarize my journal" → \`get_journal_insights_instructions\`

## Constraints
- All operations require authentication
- MCP-UI features only available in supporting clients
- Tag suggestions and journal insights require AI model access
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
		const { grantId } = this.props ?? {}
		invariant(grantId, 'You must be logged in to perform this action')
		const user = await this.db.getUserByGrantId(grantId)
		invariant(
			user,
			`No user found with the given grantId. Please claim the grant by invoking the "authenticate" tool.`,
		)
		return user
	}

	async requireGrantId() {
		const { grantId } = this.props ?? {}
		invariant(grantId, 'You must be logged in to perform this action')
		const grant = await this.db.getGrant(grantId)
		invariant(
			grant,
			'The given grant is invalid (no matching grant in the database)',
		)
		return grant
	}

	requireDomain() {
		const baseUrl = this.props?.baseUrl
		invariant(
			baseUrl,
			'This should never happen, but somehow we did not get the baseUrl from the request handler',
		)
		return baseUrl
	}

	async updateAvailableItems() {
		// No clients seem to support this yet...
		const clientSupport = false
		if (!clientSupport) return

		const { grantId } = this.props ?? {}
		if (!grantId) return

		const user = await this.db.getUserByGrantId(grantId)

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
