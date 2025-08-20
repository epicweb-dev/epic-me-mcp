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

To use any tools, follow these steps:

1. Check if the user is authenticated by calling \`whoami\`.
2. If the user is not authenticated:
   - Ask the user for their email address.
   - Call \`authenticate\` with the provided email to log in.
   - Ask the user for the validation token that was sent to their email.
   - Call \`validate_token\` with the token to validate their account.

Basic CRUD operations are available for entries, tags, and the tag-entry relationship.

## Journal Management Workflow
- **Create entries**: Use \`create_entry\` to write about experiences, thoughts, or daily reflections
- **Organize with tags**: Use \`list_tags\` to see available tags, then \`create_tag\` to create new ones (e.g., "work", "personal", "ideas"), then \`add_tag_to_entry\` to organize entries
- **Browse and read**: Use \`list_entries\` to see all entries, \`get_entry\` to read specific entries, or \`view_journal\` for a visual interface if you support MCP-UI.
- **Maintain**: Use \`update_entry\` to edit or expand entries, \`delete_entry\` to remove unwanted entries

## Best Practices
- Always use \`list_tags\` before suggesting tag creation to avoid duplicates
- Use \`list_entries\` to help users find specific entries by ID
- Suggest \`view_journal\` when users want to browse their entries visually if you support MCP-UI

## Common User Requests
- "Write in my journal" → \`create_entry\`
- "Show me my entries" → \`list_entries\` or \`view_journal\`
- "Organize my entries" → \`list_tags\` then \`create_tag\` and \`add_tag_to_entry\`
- "Find entries about work" → \`list_tags\` to find work tag, then filter entries
- "Suggest tags for this entry" → \`get_tag_suggestions_instructions\`
- "Summarize my journal" → \`get_journal_insights_instructions\`

## AI-Powered Features
- **Tag Suggestions**: Use \`get_tag_suggestions_instructions\` when users want help organizing entries with appropriate tags
- **Journal Insights**: Use \`get_journal_insights_instructions\` when users want to see patterns or get overviews of their journaling

Note: MCP prompts are also available for clients that support them: \`suggest_tags\` and \`summarize_journal_entries\`
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
		const { grantId } = this.props
		invariant(grantId, 'You must be logged in to perform this action')
		const user = await this.db.getUserByGrantId(grantId)
		invariant(
			user,
			`No user found with the given grantId. Please claim the grant by invoking the "authenticate" tool.`,
		)
		return user
	}

	async requireGrantId() {
		const { grantId } = this.props
		invariant(grantId, 'You must be logged in to perform this action')
		const grant = await this.db.getGrant(grantId)
		invariant(
			grant,
			'The given grant is invalid (no matching grant in the database)',
		)
		return grant
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
