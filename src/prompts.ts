import { type GetPromptResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { type EpicMeMCP } from './index.ts'
import { getErrorMessage } from './utils.ts'

export async function initializePrompts(agent: EpicMeMCP) {
	agent.authenticatedPrompts = [
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
				try {
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
				} catch (error) {
					return createErrorReply(error)
				}
			},
		),
	]
}

function createErrorReply(error: unknown): GetPromptResult {
	console.error(`Failed running prompt:\n`, error)
	return {
		isError: true,
		messages: [
			{
				role: 'assistant',
				content: {
					type: 'text',
					text: getErrorMessage(error),
				},
			},
		],
	}
}
