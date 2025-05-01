import { invariant } from '@epic-web/invariant'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { type EpicMeMCP } from './index.ts'
import { getErrorMessage } from './utils/misc.ts'

export async function initializeResources(agent: EpicMeMCP) {
	agent.authenticatedResources = [
		agent.server.resource(
			'user',
			'user://current',
			{
				description: 'The currently logged in user',
			},
			async (uri) => {
				const user = await agent.requireUser()
				return {
					contents: [
						{
							mimeType: 'application/json',
							text: JSON.stringify(user),
							uri: uri.toString(),
						},
					],
				}
			},
		),

		agent.server.resource(
			'entry',
			new ResourceTemplate('entry://{id}', {
				list: async () => {
					const user = await agent.requireUser()
					const entries = await agent.db.getEntries(user.id)
					return {
						resources: entries.map((entry) => ({
							name: entry.title,
							uri: `entry://${entry.id}`,
							mimeType: 'application/json',
						})),
					}
				},
			}),
			{ description: 'A single entry' },
			async (uri, { id }) => {
				try {
					const user = await agent.requireUser()
					const entry = await agent.db.getEntry(user.id, Number(id))
					invariant(entry, `Entry with ID "${id}" not found`)
					return {
						contents: [
							{
								mimeType: 'application/json',
								text: JSON.stringify(entry),
								uri: uri.toString(),
							},
						],
					}
				} catch (error) {
					return createErrorReply(uri, error)
				}
			},
		),

		agent.server.resource(
			'tag',
			new ResourceTemplate('tag://{id}', {
				list: async () => {
					const user = await agent.requireUser()
					const tags = await agent.db.getTags(user.id)
					return {
						resources: tags.map((tag) => ({
							name: tag.name,
							uri: `tag://${tag.id}`,
							mimeType: 'application/json',
						})),
					}
				},
			}),
			{ description: 'A single tag' },
			async (uri, { id }) => {
				try {
					const user = await agent.requireUser()
					const tag = await agent.db.getTag(user.id, Number(id))
					invariant(tag, `Tag with ID "${id}" not found`)
					return {
						contents: [
							{
								mimeType: 'application/json',
								text: JSON.stringify(tag),
								uri: uri.toString(),
							},
						],
					}
				} catch (error) {
					return createErrorReply(uri, error)
				}
			},
		),
	]
}

function createErrorReply(uri: URL, error: unknown): ReadResourceResult {
	console.error(`Failed running resource:\n`, error)
	return {
		isError: true,
		contents: [
			{
				mimeType: 'text/plain',
				text: getErrorMessage(error),
				uri: uri.toString(),
			},
		],
	}
}
