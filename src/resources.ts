import { invariant } from '@epic-web/invariant'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type EpicMeMCP } from './index.ts'

export async function initializeResources(agent: EpicMeMCP) {
	agent.server.resource(
		'credits',
		'epicme://credits',
		{ description: 'Who created the EpicMe project?' },
		async (uri) => {
			return {
				contents: [
					{
						mimeType: 'text/plain',
						text: 'EpicMe was created by Kent C. Dodds',
						uri: uri.toString(),
					},
				],
			}
		},
	)

	agent.unauthenticatedResources = []

	agent.authenticatedResources = [
		agent.server.resource(
			'user',
			'epicme://users/current',
			{ description: 'The currently logged in user' },
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
			new ResourceTemplate('epicme://entries/{id}', {
				list: async () => {
					const user = await agent.requireUser()
					const entries = await agent.db.getEntries(user.id)
					return {
						resources: entries.map((entry) => ({
							name: entry.title,
							uri: `epicme://entries/${entry.id}`,
							mimeType: 'application/json',
						})),
					}
				},
			}),
			{ description: 'A journal entry' },
			async (uri, { id }) => {
				const user = await agent.requireUser()
				const entry = await agent.db.getEntry(user.id, Number(id))
				invariant(entry, `Entry with ID "${id}" not found`)
				return {
					contents: [
						{
							mimeType: 'application/json',
							uri: uri.toString(),
							text: JSON.stringify(entry),
						},
					],
				}
			},
		),

		agent.server.resource(
			'tags',
			'epicme://tags',
			{ description: 'All tags' },
			async (uri) => {
				const user = await agent.requireUser()
				const tags = await agent.db.getTags(user.id)
				return {
					contents: [
						{
							mimeType: 'application/json',
							text: JSON.stringify(tags),
							uri: uri.toString(),
						},
					],
				}
			},
		),

		agent.server.resource(
			'tag',
			new ResourceTemplate('epicme://tags/{id}', {
				list: async () => {
					const user = await agent.requireUser()
					const tags = await agent.db.getTags(user.id)
					return {
						resources: tags.map((tag) => ({
							name: tag.name,
							uri: `epicme://tags/${tag.id}`,
							mimeType: 'application/json',
						})),
					}
				},
			}),
			{ description: 'A journal tag' },
			async (uri, { id }) => {
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
			},
		),
	]
}
