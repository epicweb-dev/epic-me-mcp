import { invariant } from '@epic-web/invariant'
import { type GetPromptResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { type EpicMeMCP } from './index.ts'

type Entries = Awaited<ReturnType<EpicMeMCP['db']['getEntries']>>
type Entry = Awaited<ReturnType<EpicMeMCP['db']['getEntry']>>
type Tags = Awaited<ReturnType<EpicMeMCP['db']['getTags']>>

export async function initializePrompts(agent: EpicMeMCP) {
	agent.authenticatedPrompts = [
		agent.server.registerPrompt(
			'suggest_tags',
			{
				title: 'Suggest Tags',
				description:
					'Get AI-powered tag suggestions for a journal entry and optionally create/apply them',
				argsSchema: {
					entryId: z
						.string()
						.describe('The ID of the journal entry to suggest tags for'),
				},
			},
			async ({ entryId }) => {
				const user = await requireUser()
				invariant(entryId, 'entryId is required')
				const entryIdNum = Number(entryId)
				invariant(!Number.isNaN(entryIdNum), 'entryId must be a valid number')

				const entry = await agent.db.getEntry(user.id, entryIdNum)
				invariant(
					entry,
					`Entry with ID "${entryId}" not found. Use list_entries to see all available entries.`,
				)

				const tags = await agent.db.getTags(user.id)
				return createSuggestTagsPrompt(entryId, entry, tags)
			},
		),
		agent.server.registerPrompt(
			'summarize_journal_entries',
			{
				title: 'Summarize Journal Entries',
				description:
					'Get AI-powered insights and summaries of your journal entries, optionally filtered by tags or date range',
				argsSchema: {
					tagIds: z
						.string()
						.optional()
						.describe(
							'Optional comma-separated set of tag IDs to filter entries by',
						),
					from: z
						.string()
						.optional()
						.describe(
							'Optional date string in YYYY-MM-DD format to filter entries by',
						),
					to: z
						.string()
						.optional()
						.describe(
							'Optional date string in YYYY-MM-DD format to filter entries by',
						),
				},
			},
			async ({ tagIds, from, to }) => {
				const user = await agent.requireUser()
				const entries = await agent.db.getEntries(
					user.id,
					tagIds ? tagIds.split(',').map(Number) : undefined,
					from,
					to,
				)
				if (entries.length !== 0) {
					await agent.server.server.sendLoggingMessage({
						level: 'info',
						data: `Summarizing ${entries.length} journal entries`,
					})
				}
				return createSummarizeJournalPrompt(entries)
			},
		),
	]

	async function requireUser() {
		const { grantId } = agent.props
		invariant(grantId, 'You must be logged in to perform this action')
		const user = await agent.db.getUserByGrantId(grantId)
		invariant(
			user,
			`No user found with the given grantId. Please claim the grant by invoking the "authenticate" tool.`,
		)
		return user
	}
}

// Prompt creation functions that can be reused by both prompts and tools
export function createSuggestTagsPrompt(
	entryId: string,
	entry: Entry,
	tags: Tags,
) {
	return {
		messages: [
			{
				role: 'user' as const,
				content: {
					type: 'text' as const,
					text: `\nBelow is my EpicMe journal entry with ID "${entryId}" and the tags I have available.\n\nPlease suggest some tags to add to it. Feel free to suggest new tags I don't have yet.\n\nFor each tag I approve, if it does not yet exist, create it with the EpicMe "create_tag" tool. Then add approved tags to the entry with the EpicMe "add_tag_to_entry" tool.`.trim(),
				},
			},
			{
				role: 'user' as const,
				content: {
					type: 'resource' as const,
					resource: {
						uri: 'epicme://tags',
						mimeType: 'application/json',
						text: JSON.stringify(tags),
					},
				},
			},
			{
				role: 'user' as const,
				content: {
					type: 'resource' as const,
					resource: {
						uri: `epicme://entries/${entryId}`,
						mimeType: 'application/json',
						text: JSON.stringify(entry),
					},
				},
			},
		],
	}
}

export function createSummarizeJournalPrompt(entries: Entries) {
	if (entries.length === 0) {
		return {
			messages: [
				{
					role: 'assistant' as const,
					content: {
						type: 'text' as const,
						text: 'You have no journal entries yet. Would you like to create one?',
					},
				},
			],
		} satisfies GetPromptResult
	}
	return {
		messages: [
			{
				role: 'user' as const,
				content: {
					type: 'text' as const,
					text: `Here are my journal entries:\n\n${entries
						.map(
							(entry) =>
								`- "${entry.title}" (ID: ${entry.id})${entry.tagCount ? ` - ${entry.tagCount} tags` : ''}`,
						)
						.join('\n')}\n\nCan you please summarize them for me?`,
				},
			},
		],
	} satisfies GetPromptResult
}
