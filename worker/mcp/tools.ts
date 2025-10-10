import { invariant } from '@epic-web/invariant'
import { generateTOTP } from '@epic-web/totp'
import { createUIResource } from '@mcp-ui/server'
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import {
	createEntryInputSchema,
	createTagInputSchema,
	entryTagSchema,
	updateEntryInputSchema,
	tagSchema,
	userSchema,
	updateTagInputSchema,
	tagIdSchema,
	entryTagIdSchema,
	entryWithTagsSchema,
	entryIdSchema,
} from '../db/schema.ts'
import { sendEmail } from '../utils/email.ts'
import { type EpicMeMCP } from './index.ts'
import {
	createSuggestTagsPrompt,
	createSummarizeJournalPrompt,
} from './prompts.ts'
import { suggestTagsSampling } from './sampling.ts'

export async function initializeTools(agent: EpicMeMCP) {
	agent.unauthenticatedTools.push(
		agent.server.registerTool(
			'authenticate',
			{
				title: 'Authenticate',
				description: `Authenticate to your account or create a new account. Ask for the user's email address before authenticating. Only do this when explicitely told to do so.`,
				annotations: {
					destructiveHint: false,
				} satisfies ToolAnnotations,
				inputSchema: {
					email: z
						.string()
						.email()
						.describe("The user's email address for their account"),
				},
			},
			async ({ email }) => {
				const baseUrl = agent.requireDomain()
				const grant = await agent.requireGrantId()
				const { otp } = await generateTOTP({
					period: 30,
					digits: 6,
					algorithm: 'SHA-512',
				})
				await agent.db.createValidationToken(email, grant.id, otp)
				await sendEmail({
					to: email,
					subject: 'EpicMeMCP Validation Token',
					html: `Here's your EpicMeMCP validation token: ${otp}`,
					text: `Here's your EpicMeMCP validation token: ${otp}`,
				})
				const uiUrl = new URL(`/ui/token-input`, baseUrl)
				uiUrl.searchParams.set('email', email)
				return {
					content: [
						createText(
							`The user has been sent an email to ${email} with a validation token. Please have the user submit that token using the validate_token tool.`,
						),
						createUIResource({
							uri: `ui://token-input/${grant.id}`,
							content: {
								type: 'externalUrl',
								iframeUrl: uiUrl.toString(),
							},
							encoding: 'text',
						}),
					],
				}
			},
		),
		agent.server.registerTool(
			'validate_token',
			{
				title: 'Validate Token',
				description:
					"Validate the user session with the 6-digit token sent to the user's email",
				annotations: {
					destructiveHint: false,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				inputSchema: {
					validationToken: z.string().describe('The 6-digit token'),
				},
			},
			async ({ validationToken }) => {
				const grant = await agent.requireGrantId()
				const user = await agent.db.validateTokenToGrant(
					grant.id,
					validationToken,
				)
				return {
					content: [
						createText(
							`The user's token has been validated as the owner of the account "${user.email}" (ID: ${user.id}). The user can now execute authenticated tools.`,
						),
					],
				}
			},
		),
	)

	agent.authenticatedTools.push(
		// agent.server.registerTool(
		// 	'view_journal',
		// 	{
		// 		title: 'View Journal',
		// 		description:
		// 			'View your journal entries in a beautiful, scrollable interface',
		// 		annotations: {
		// 			readOnlyHint: true,
		// 			openWorldHint: false,
		// 		} satisfies ToolAnnotations,
		// 	},
		// 	async () => {
		// 		const user = await agent.requireUser()
		// 		const baseUrl = agent.requireDomain()
		// 		const uiUrl = new URL(`/ui/journal-viewer`, baseUrl)
		// 		const entries = await agent.db.getEntries(user.id)
		// 		return {
		// 			content: [
		// 				createText(
		// 					`Here's your journal viewer. You can scroll through your entries and expand them to read the full content.`,
		// 				),
		// 				createUIResource({
		// 					uri: `ui://journal-viewer/${user.id}`,
		// 					content: {
		// 						type: 'externalUrl',
		// 						iframeUrl: uiUrl.toString(),
		// 					},
		// 					encoding: 'text',
		// 					uiMetadata: {
		// 						'initial-render-data': { entries },
		// 					},
		// 				}),
		// 			],
		// 		}
		// 	},
		// ),
		// agent.server.registerTool(
		// 	'view_entry',
		// 	{
		// 		title: 'View Entry',
		// 		description: 'View a journal entry by ID visually',
		// 		annotations: {
		// 			readOnlyHint: true,
		// 			openWorldHint: false,
		// 		} satisfies ToolAnnotations,
		// 		inputSchema: entryIdSchema,
		// 	},
		// 	async ({ id }) => {
		// 		const user = await agent.requireUser()
		// 		const baseUrl = agent.requireDomain()
		// 		const iframeUrl = new URL('/ui/entry-viewer', baseUrl)
		// 		const entry = await agent.db.getEntry(user.id, id)
		// 		invariant(entry, `Entry with ID "${id}" not found`)

		// 		return {
		// 			content: [
		// 				createUIResource({
		// 					uri: `ui://view-entry/${id}`,
		// 					content: {
		// 						type: 'externalUrl',
		// 						iframeUrl: iframeUrl.toString(),
		// 					},
		// 					encoding: 'text',
		// 					uiMetadata: {
		// 						'initial-render-data': { entry },
		// 					},
		// 				}),
		// 			],
		// 		}
		// 	},
		// ),
		agent.server.registerTool(
			'whoami',
			{
				title: 'Who Am I',
				description: 'Get information about the currently logged in user',
				annotations: {
					readOnlyHint: true,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				outputSchema: { user: userSchema },
			},
			async () => {
				const user = await agent.requireUser()
				return {
					structuredContent: { user },
					content: [createText(JSON.stringify({ user }, null, 2))],
				}
			},
		),
		agent.server.registerTool(
			'logout',
			{
				title: 'Logout',
				description: 'Remove authentication information',
				annotations: {
					idempotentHint: true,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				outputSchema: {
					success: z.boolean(),
					message: z.string(),
				},
			},
			async () => {
				const { grantId } = agent.props ?? {}
				invariant(grantId, 'You must be logged in to perform this action')
				const user = await agent.requireUser()
				await agent.db.unclaimGrant(user.id, grantId)
				const structuredContent = {
					success: true,
					message: 'Logout successful',
				}
				return {
					structuredContent,
					content: [createText(structuredContent.message)],
				}
			},
		),
		agent.server.registerTool(
			'create_entry',
			{
				title: 'Create Entry',
				description: 'Create a new journal entry',
				annotations: {
					destructiveHint: false,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				inputSchema: createEntryInputSchema,
				outputSchema: { entry: entryWithTagsSchema },
			},
			async (entry) => {
				const user = await agent.requireUser()
				const createdEntry = await agent.db.createEntry(user.id, entry)
				if (entry.tags) {
					for (const tagId of entry.tags) {
						await agent.db.addTagToEntry(user.id, {
							entryId: createdEntry.id,
							tagId,
						})
					}
				}

				void suggestTagsSampling(user.id, agent, createdEntry.id)

				return {
					structuredContent: { entry: createdEntry },
					content: [
						createText(
							`✅ Entry "${createdEntry.title}" created successfully with ID "${createdEntry.id}"`,
						),
						createText(
							'💡 You can now add tags to organize this entry, or create another entry',
						),
						createEntryResourceLink(createdEntry),
					],
				}
			},
		),
		agent.server.registerTool(
			'get_entry',
			{
				title: 'Get Entry',
				description: 'Get a journal entry by ID',
				annotations: {
					readOnlyHint: true,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				inputSchema: {
					id: z.number().describe('The ID of the entry'),
				},
				outputSchema: { entry: entryWithTagsSchema },
			},
			async ({ id }) => {
				const user = await agent.requireUser()
				const entry = await agent.db.getEntry(user.id, id)
				invariant(
					entry,
					`Entry with ID "${id}" not found. Use list_entries to see all available entries.`,
				)
				const structuredContent = { entry }
				return {
					structuredContent,
					content: [
						createEntryResourceLink(entry),
						createText(structuredContent),
					],
				}
			},
		),
		agent.server.registerTool(
			'list_entries',
			{
				title: 'List Entries',
				description: 'List all journal entries',
				annotations: {
					readOnlyHint: true,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				inputSchema: {
					tagIds: z
						.array(z.number())
						.optional()
						.describe('Optional: filter entries by specific tag IDs'),
				},
			},
			async ({ tagIds }) => {
				const user = await agent.requireUser()
				const entries = await agent.db.getEntries(user.id, tagIds)
				const entryLinks = entries.map(createEntryResourceLink)
				const structuredContent = { entries }

				if (entries.length === 0) {
					return {
						structuredContent,
						content: [
							createText('📝 Your journal is empty!'),
							createText('💡 Try creating your first entry with create_entry'),
						],
					}
				}

				return {
					structuredContent,
					content: [
						createText(`Found ${entries.length} entries.`),
						...entryLinks,
						createText(structuredContent),
					],
				}
			},
		),

		// agent.server.registerTool(
		// 	'update_entry',
		// 	{
		// 		title: 'Update Entry',
		// 		description:
		// 			'Update a journal entry. Only provided fields will be updated.',
		// 		annotations: {
		// 			destructiveHint: false,
		// 			idempotentHint: true,
		// 			openWorldHint: false,
		// 		} satisfies ToolAnnotations,
		// 		inputSchema: updateEntryInputSchema,
		// 		outputSchema: { entry: entryWithTagsSchema },
		// 	},
		// 	async ({ id, ...updates }) => {
		// 		const user = await agent.requireUser()
		// 		const existingEntry = await agent.db.getEntry(user.id, id)
		// 		invariant(
		// 			existingEntry,
		// 			`Entry with ID "${id}" not found. Use list_entries to see all available entries.`,
		// 		)
		// 		const updatedEntry = await agent.db.updateEntry(user.id, id, updates)
		// 		return {
		// 			structuredContent: { entry: updatedEntry },
		// 			content: [
		// 				createText(
		// 					`Entry "${updatedEntry.title}" (ID: ${id}) updated successfully`,
		// 				),
		// 				createEntryResourceLink(updatedEntry),
		// 			],
		// 		}
		// 	},
		// ),
		agent.server.registerTool(
			'delete_entry',
			{
				title: 'Delete Entry',
				description: 'Delete a journal entry',
				annotations: {
					idempotentHint: true,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				inputSchema: {
					id: z.number().describe('The ID of the entry'),
				},
				outputSchema: {
					success: z.boolean(),
					message: z.string(),
					entry: entryWithTagsSchema.optional(),
				},
			},
			async ({ id }) => {
				const user = await agent.requireUser()
				const existingEntry = await agent.db.getEntry(user.id, id)
				invariant(
					existingEntry,
					`Entry with ID "${id}" not found. Use list_entries to see all available entries.`,
				)
				const confirmed = await elicitConfirmation(
					agent,
					'Are you sure you want to delete this entry?',
				)
				if (!confirmed) {
					return {
						structuredContent: {
							success: false,
							message: 'Entry deletion cancelled',
						},
						content: [createText('Entry deletion cancelled')],
					}
				}
				await agent.db.deleteEntry(user.id, id)
				const structuredContent = {
					success: true,
					message: `Entry "${existingEntry.title}" (ID: ${id}) deleted successfully`,
					entry: existingEntry,
				}
				return {
					structuredContent,
					content: [
						createText(structuredContent.message),
						createEntryResourceLink(existingEntry),
					],
				}
			},
		),
		agent.server.registerTool(
			'create_tag',
			{
				title: 'Create Tag',
				description: 'Create a new tag',
				annotations: {
					destructiveHint: false,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				inputSchema: createTagInputSchema,
				outputSchema: { tag: tagSchema },
			},
			async (tag) => {
				const user = await agent.requireUser()
				const createdTag = await agent.db.createTag(user.id, tag)
				return {
					structuredContent: { tag: createdTag },
					content: [
						createText(
							`🏷️ Tag "${createdTag.name}" created successfully with ID "${createdTag.id}"`,
						),
						createText(
							'💡 You can now find entries to add this tag to with list_entries, or add this tag to entries with add_tag_to_entry',
						),
						createTagResourceLink(createdTag),
					],
				}
			},
		),
		agent.server.registerTool(
			'get_tag',
			{
				title: 'Get Tag',
				description: 'Get a tag by ID',
				annotations: {
					readOnlyHint: true,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				inputSchema: {
					id: z.number().describe('The ID of the tag'),
				},
				outputSchema: { tag: tagSchema },
			},
			async ({ id }) => {
				const user = await agent.requireUser()
				const tag = await agent.db.getTag(user.id, id)
				invariant(
					tag,
					`Tag ID "${id}" not found. Use list_tags to see all available tags.`,
				)
				const structuredContent = { tag }
				return {
					structuredContent,
					content: [createTagResourceLink(tag), createText(structuredContent)],
				}
			},
		),
		agent.server.registerTool(
			'list_tags',
			{
				title: 'List Tags',
				description: 'List all tags',
				annotations: {
					readOnlyHint: true,
					openWorldHint: false,
				} satisfies ToolAnnotations,
			},
			async () => {
				const user = await agent.requireUser()
				const tags = await agent.db.getTags(user.id)
				const tagLinks = tags.map(createTagResourceLink)
				const structuredContent = { tags }

				if (tags.length === 0) {
					return {
						structuredContent,
						content: [
							createText('🏷️ No tags yet!'),
							createText(
								'💡 Create your first tag with create_tag to start organizing your entries',
							),
						],
					}
				}

				return {
					structuredContent,
					content: [
						createText(`Found ${tags.length} tags.`),
						...tagLinks,
						createText(structuredContent),
					],
				}
			},
		),
		// agent.server.registerTool(
		// 	'update_tag',
		// 	{
		// 		title: 'Update Tag',
		// 		description: 'Update a tag',
		// 		annotations: {
		// 			destructiveHint: false,
		// 			idempotentHint: true,
		// 			openWorldHint: false,
		// 		} satisfies ToolAnnotations,
		// 		inputSchema: updateTagInputSchema,
		// 		outputSchema: { tag: tagSchema },
		// 	},
		// 	async ({ id, ...updates }) => {
		// 		const user = await agent.requireUser()
		// 		const updatedTag = await agent.db.updateTag(user.id, id, updates)
		// 		const structuredContent = { tag: updatedTag }
		// 		return {
		// 			structuredContent,
		// 			content: [
		// 				createText(
		// 					`Tag "${updatedTag.name}" (ID: ${id}) updated successfully`,
		// 				),
		// 				createTagResourceLink(updatedTag),
		// 				createText(structuredContent),
		// 			],
		// 		}
		// 	},
		// ),
		agent.server.registerTool(
			'delete_tag',
			{
				title: 'Delete Tag',
				description: 'Delete a tag',
				annotations: {
					idempotentHint: true,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				inputSchema: tagIdSchema,
				outputSchema: { success: z.boolean(), tag: tagSchema },
			},
			async ({ id }) => {
				const user = await agent.requireUser()
				const existingTag = await agent.db.getTag(user.id, id)
				invariant(
					existingTag,
					`Tag ID "${id}" not found. Use list_tags to see all available tags.`,
				)
				const confirmed = await elicitConfirmation(
					agent,
					`Are you sure you want to delete tag "${existingTag.name}" (ID: ${id})?`,
				)

				if (!confirmed) {
					const structuredContent = { success: false, tag: existingTag }
					return {
						structuredContent,
						content: [
							createText(
								`Deleting tag "${existingTag.name}" (ID: ${id}) rejected by the user.`,
							),
							createTagResourceLink(existingTag),
							createText(structuredContent),
						],
					}
				}

				await agent.db.deleteTag(user.id, id)
				const structuredContent = { success: true, tag: existingTag }
				return {
					structuredContent,
					content: [
						createText(
							`Tag "${existingTag.name}" (ID: ${id}) deleted successfully`,
						),
						createTagResourceLink(existingTag),
						createText(structuredContent),
					],
				}
			},
		),
		agent.server.registerTool(
			'add_tag_to_entry',
			{
				title: 'Add Tag to Entry',
				description: 'Add a tag to an existing journal entry',
				annotations: {
					destructiveHint: false,
					idempotentHint: true,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				inputSchema: entryTagIdSchema,
				outputSchema: { success: z.boolean(), entryTag: entryTagSchema },
			},
			async ({ entryId, tagId }) => {
				const user = await agent.requireUser()
				const tag = await agent.db.getTag(user.id, tagId)
				const entry = await agent.db.getEntry(user.id, entryId)
				invariant(
					tag,
					`Tag ID ${tagId} not found. Use list_tags to see all available tags.`,
				)
				invariant(
					entry,
					`Entry with ID "${entryId}" not found. Use list_entries to see all available entries.`,
				)
				const entryTag = await agent.db.addTagToEntry(user.id, {
					entryId,
					tagId,
				})
				const structuredContent = { success: true, entryTag }
				return {
					structuredContent,
					content: [
						createText(
							`✅ Tag "${tag.name}" added to entry "${entry.title}" successfully`,
						),
						createText(
							'💡 Your entry is now organized! You can add more tags or view all entries',
						),
						createTagResourceLink(tag),
						createEntryResourceLink(entry),
						createText(structuredContent),
					],
				}
			},
		),
	)
}

export async function initializePromptTools(agent: EpicMeMCP) {
	agent.authenticatedTools.push(
		agent.server.registerTool(
			'get_tag_suggestions_instructions',
			{
				title: 'Get Tag Suggestions Instructions',
				description:
					'Get instructions on how to suggest tags for a journal entry',
				annotations: {
					readOnlyHint: true,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				inputSchema: {
					entryId: z
						.number()
						.describe('The ID of the journal entry to get tag suggestions for'),
				},
			},
			async ({ entryId }) => {
				const user = await agent.requireUser()
				const entry = await agent.db.getEntry(user.id, entryId)
				invariant(
					entry,
					`Entry with ID "${entryId}" not found. Use list_entries to see all available entries.`,
				)
				const tags = await agent.db.getTags(user.id)
				const result = createSuggestTagsPrompt(entryId.toString(), entry, tags)
				return {
					content: result.messages.map((m) => m.content),
				}
			},
		),
		agent.server.registerTool(
			'get_journal_insights_instructions',
			{
				title: 'Get Journal Insights Instructions',
				description:
					'Git instructions for how to summarize journal entries, optionally filtered by tags or date range',
				annotations: {
					readOnlyHint: true,
					openWorldHint: false,
				} satisfies ToolAnnotations,
				inputSchema: {
					tagIds: z
						.array(z.number())
						.optional()
						.describe('Optional: filter entries by specific tag IDs'),
					from: z
						.string()
						.optional()
						.describe('Optional: start date in YYYY-MM-DD format'),
					to: z
						.string()
						.optional()
						.describe('Optional: end date in YYYY-MM-DD format'),
				},
			},
			async ({ tagIds, from, to }) => {
				const user = await agent.requireUser()
				const entries = await agent.db.getEntries(user.id, tagIds, from, to)
				const prompt = createSummarizeJournalPrompt(entries)
				return {
					content: prompt.messages.map((m) => m.content),
				}
			},
		),
	)
}

type ToolAnnotations = {
	// defaults to true, so only allow false
	openWorldHint?: false
} & (
	| {
			// when readOnlyHint is true, none of the other annotations can be changed
			readOnlyHint: true
	  }
	| {
			destructiveHint?: false // Only allow false (default is true)
			idempotentHint?: true // Only allow true (default is false)
	  }
)

function createText(text: unknown): CallToolResult['content'][number] {
	if (typeof text === 'string') {
		return { type: 'text', text }
	} else {
		return { type: 'text', text: JSON.stringify(text) }
	}
}

type ResourceLinkContent = Extract<
	CallToolResult['content'][number],
	{ type: 'resource_link' }
>

function createEntryResourceLink(entry: {
	id: number
	title: string
}): ResourceLinkContent {
	return {
		type: 'resource_link',
		uri: `epicme://entries/${entry.id}`,
		name: entry.title,
		description: `Journal Entry: "${entry.title}"`,
		mimeType: 'application/json',
	}
}

function createTagResourceLink(tag: {
	id: number
	name: string
}): ResourceLinkContent {
	return {
		type: 'resource_link',
		uri: `epicme://tags/${tag.id}`,
		name: tag.name,
		description: `Tag: "${tag.name}"`,
		mimeType: 'application/json',
	}
}

async function elicitConfirmation(agent: EpicMeMCP, message: string) {
	const capabilities = agent.server.server.getClientCapabilities()
	if (!capabilities?.elicitation) {
		return true
	}

	const result = await agent.elicitInput({
		message,
		requestedSchema: {
			type: 'object',
			properties: {
				confirmed: {
					type: 'boolean',
					description: 'Whether to confirm the action',
				},
			},
		},
	})
	return result.action === 'accept' && result.content?.confirmed === true
}
