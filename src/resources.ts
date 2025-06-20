import { invariant } from '@epic-web/invariant'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { type EpicMeMCP } from './index.ts'

export async function initializeResources(agent: EpicMeMCP) {
	// Unauthenticated resources (if any) can be added similarly if needed

	agent.authenticatedResources = [
		agent.server.registerResource(
			'credits',
			'epicme://credits',
			{ description: 'Who created the EpicMe project?' },
			async (uri: URL) => {
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
		),
		agent.server.registerResource(
			'user',
			'epicme://users/current',
			{ description: 'The currently logged in user' },
			async (uri: URL) => {
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
		agent.server.registerResource(
			'entry',
			new ResourceTemplate('epicme://entries/{id}', {
				complete: {
					async id(value) {
						const user = await agent.requireUser()
						const entries = await agent.db.getEntries(user.id)
						return entries
							.map((entry) => entry.id.toString())
							.filter((id) => id.includes(value))
					},
				},
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
			async (uri: URL, { id }) => {
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
		agent.server.registerResource(
			'tags',
			'epicme://tags',
			{ description: 'All tags' },
			async (uri: URL) => {
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
		agent.server.registerResource(
			'tag',
			new ResourceTemplate('epicme://tags/{id}', {
				complete: {
					async id(value) {
						const user = await agent.requireUser()
						const entries = await agent.db.getTags(user.id)
						return entries
							.map((entry) => entry.id.toString())
							.filter((id) => id.includes(value))
					},
				},
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
			async (uri: URL, { id }) => {
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
