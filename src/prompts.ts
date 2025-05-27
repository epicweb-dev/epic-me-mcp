import { invariant } from '@epic-web/invariant'
import { type GetPromptResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { type EpicMeMCP } from './index.ts'

export async function initializePrompts(agent: EpicMeMCP) {
	agent.authenticatedPrompts = [
		agent.server.prompt(
			'suggest_tags',
			'Suggest tags for a journal entry',
			{
				entryId: z
					.string()
					.describe('The ID of the journal entry to suggest tags for'),
			},
			async ({ entryId }) => {
				const user = await requireUser()
				invariant(entryId, 'entryId is required')
				const entryIdNum = Number(entryId)
				invariant(!Number.isNaN(entryIdNum), 'entryId must be a valid number')

				const entry = await agent.db.getEntry(user.id, entryIdNum)
				invariant(entry, `entry with the ID "${entryId}" not found`)

				const tags = await agent.db.getTags(user.id)
				return {
					messages: [
						{
							role: 'user',
							content: {
								type: 'text',
								text: `
Below is my EpicMe journal entry with ID "${entryId}" and the tags I have available.

Please suggest some tags to add to it. Feel free to suggest new tags I don't have yet.

For each tag I approve, if it does not yet exist, create it with the EpicMe "create_tag" tool. Then add approved tags to the entry with the EpicMe "add_tag_to_entry" tool.
								`.trim(),
							},
						},
						{
							role: 'user',
							content: {
								type: 'resource',
								resource: {
									uri: 'epicme://tags',
									mimeType: 'application/json',
									text: JSON.stringify(tags),
								},
							},
						},
						{
							role: 'user',
							content: {
								type: 'resource',
								resource: {
									uri: `epicme://entries/${entryId}`,
									mimeType: 'application/json',
									text: JSON.stringify(entry),
								},
							},
						},
					],
				}
			},
		),

		agent.server.prompt(
			'summarize-journal-entries',
			'Summarize your past journal entries, optionally filtered by tags or date range.',
			{
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
			async ({ tagIds, from, to }) => {
				const user = await agent.requireUser()
				const entries = await agent.db.getEntries(
					user.id,
					tagIds ? tagIds.split(',').map(Number) : undefined,
					from,
					to,
				)
				if (entries.length === 0) {
					return {
						messages: [
							{
								role: 'assistant',
								content: {
									type: 'text',
									text: 'You have no journal entries yet. Would you like to create one?',
								},
							},
						],
					} satisfies GetPromptResult
				}
				await agent.server.server.sendLoggingMessage({
					level: 'info',
					data: `Summarizing ${entries.length} journal entries`,
				})
				return {
					messages: [
						{
							role: 'user',
							content: {
								type: 'text',
								text: `Here are my journal entries:\n\n${entries
									.map(
										(entry) =>
											`- "${entry.title}" (ID: ${entry.id})${
												entry.tagCount ? ` - ${entry.tagCount} tags` : ''
											}`,
									)
									.join('\n')}\n\nCan you please summarize them for me?`,
							},
						},
					],
				} satisfies GetPromptResult
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
