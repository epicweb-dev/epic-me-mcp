import { invariant } from '@epic-web/invariant'
import { generateTOTP } from '@epic-web/totp'
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import {
	createEntryInputSchema,
	createTagInputSchema,
	entrySchema,
	entryTagSchema,
	tagSchema,
	userSchema,
} from './db/schema.ts'
import { type EpicMeMCP } from './index.ts'
import { sendEmail } from './utils/email.ts'

export async function initializeTools(agent: EpicMeMCP) {
	agent.unauthenticatedTools = [
		agent.server.registerTool(
			'authenticate',
			{
				title: 'Authenticate',
				description: `Authenticate to your account or create a new account. Ask for the user's email address before authenticating. Only do this when explicitely told to do so.`,
				annotations: {
					destructiveHint: false,
				},
				inputSchema: {
					email: z
						.string()
						.email()
						.describe(
							`The user's email address for their account.\n\nPlease ask them explicitely for their email address and don't just guess.`,
						),
				},
			},
			async ({ email }) => {
				const grant = await requireGrantId()
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
				return {
					content: [
						createTextContent(
							`The user has been sent an email to ${email} with a validation token. Please have the user submit that token using the validate_token tool.`,
						),
					],
				}
			},
		),
		agent.server.registerTool(
			'validate_token',
			{
				title: 'Validate Token',
				description: 'Validate a token which was emailed',
				annotations: {
					destructiveHint: false,
					openWorldHint: false,
				},
				inputSchema: {
					validationToken: z
						.string()
						.describe(
							'The validation token the user received in their email inbox from the authenticate tool',
						),
				},
			},
			async ({ validationToken }) => {
				const grant = await requireGrantId()
				const user = await agent.db.validateTokenToGrant(
					grant.id,
					validationToken,
				)
				agent.setState({ userId: user.id })
				return {
					content: [
						createTextContent(
							`The user's token has been validated as the owner of the account "${user.email}" (ID: ${user.id}). The user can now execute authenticated tools.`,
						),
					],
				}
			},
		),
	]

	agent.authenticatedTools = [
		agent.server.registerTool(
			'whoami',
			{
				title: 'Who Am I',
				description: 'Get information about the currently logged in user',
				annotations: {
					readOnlyHint: true,
					openWorldHint: false,
				},
				outputSchema: { user: userSchema },
			},
			async () => {
				const user = await requireUser()
				return {
					structuredContent: { user },
					content: [createTextContent(JSON.stringify({ user }, null, 2))],
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
				},
				outputSchema: {
					success: z.boolean(),
					message: z.string(),
				},
			},
			async () => {
				const user = await requireUser()
				await agent.db.unclaimGrant(user.id, agent.props.grantId)
				const structuredContent = {
					success: true,
					message: 'Logout successful',
				}
				return {
					structuredContent,
					content: [createTextContent(structuredContent.message)],
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
				},
				inputSchema: createEntryInputSchema,
				outputSchema: { entry: entrySchema },
			},
			async (entry) => {
				const user = await requireUser()
				const createdEntry = await agent.db.createEntry(user.id, entry)
				if (entry.tags) {
					for (const tagId of entry.tags) {
						await agent.db.addTagToEntry(user.id, {
							entryId: createdEntry.id,
							tagId,
						})
					}
				}
				return {
					structuredContent: { entry: createdEntry },
					content: [
						createTextContent(
							`Entry "${createdEntry.title}" created successfully with ID "${createdEntry.id}"`,
						),
						createEntryResourceContent(createdEntry),
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
				},
				inputSchema: {
					id: z.number().describe('The ID of the entry'),
				},
				outputSchema: { entry: entrySchema },
			},
			async ({ id }) => {
				const user = await requireUser()
				const entry = await agent.db.getEntry(user.id, id)
				invariant(entry, `Entry with ID "${id}" not found`)
				return {
					structuredContent: { entry },
					content: [
						createTextContent(JSON.stringify(entry, null, 2)),
						createEntryResourceContent(entry),
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
				},
				inputSchema: {
					tagIds: z
						.array(z.number())
						.optional()
						.describe('Optional array of tag IDs to filter entries by'),
				},
				outputSchema: {
					entries: z.array(
						z.object({
							title: z.string(),
							id: z.number(),
							tagCount: z.number(),
						}),
					),
				},
			},
			async ({ tagIds }) => {
				const user = await requireUser()
				const entries = await agent.db.getEntries(user.id, tagIds)
				const structuredContent = { entries }
				return {
					structuredContent,
					content: [
						createTextContent(JSON.stringify(structuredContent, null, 2)),
					],
				}
			},
		),
		agent.server.registerTool(
			'update_entry',
			{
				title: 'Update Entry',
				description:
					'Update a journal entry. Fields that are not provided (or set to undefined) will not be updated. Fields that are set to null or any other value will be updated.',
				annotations: {
					destructiveHint: false,
					idempotentHint: true,
					openWorldHint: false,
				},
				inputSchema: {
					id: z.number(),
					title: z.string().optional().describe('The title of the entry'),
					content: z.string().optional().describe('The content of the entry'),
					mood: z
						.string()
						.nullable()
						.optional()
						.describe(
							'The mood of the entry (for example: "happy", "sad", "anxious", "excited")',
						),
					location: z
						.string()
						.nullable()
						.optional()
						.describe(
							'The location of the entry (for example: "home", "work", "school", "park")',
						),
					weather: z
						.string()
						.nullable()
						.optional()
						.describe(
							'The weather of the entry (for example: "sunny", "cloudy", "rainy", "snowy")',
						),
					isPrivate: z
						.number()
						.optional()
						.describe(
							'Whether the entry is private (1 for private, 0 for public)',
						),
					isFavorite: z
						.number()
						.optional()
						.describe(
							'Whether the entry is a favorite (1 for favorite, 0 for not favorite)',
						),
				},
				outputSchema: { entry: entrySchema },
			},
			async ({ id, ...updates }) => {
				const user = await requireUser()
				const existingEntry = await agent.db.getEntry(user.id, id)
				invariant(existingEntry, `Entry with ID "${id}" not found`)
				const updatedEntry = await agent.db.updateEntry(user.id, id, updates)
				return {
					structuredContent: { entry: updatedEntry },
					content: [
						createTextContent(
							`Entry "${updatedEntry.title}" (ID: ${id}) updated successfully`,
						),
						createEntryResourceContent(updatedEntry),
					],
				}
			},
		),
		agent.server.registerTool(
			'delete_entry',
			{
				title: 'Delete Entry',
				description: 'Delete a journal entry',
				annotations: {
					idempotentHint: true,
					openWorldHint: false,
				},
				inputSchema: {
					id: z.number().describe('The ID of the entry'),
				},
				outputSchema: {
					success: z.boolean(),
					message: z.string(),
					entry: entrySchema.optional(),
				},
			},
			async ({ id }) => {
				const user = await requireUser()
				const existingEntry = await agent.db.getEntry(user.id, id)
				invariant(existingEntry, `Entry with ID "${id}" not found`)
				const confirmed = await agent.server.server.elicitInput({
					message: `Are you sure you want to delete entry "${existingEntry.title}" (ID: ${id})?`,
					requestedSchema: {
						type: 'object',
						properties: {
							confirmed: {
								type: 'boolean',
								description: 'Whether to confirm the entry deletion',
							},
						},
					},
				})
				if (!confirmed) {
					return {
						structuredContent: {
							success: false,
							message: 'Entry deletion cancelled',
						},
						content: [createTextContent('Entry deletion cancelled')],
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
						createTextContent(structuredContent.message),
						createEntryResourceContent(existingEntry),
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
				},
				inputSchema: createTagInputSchema,
				outputSchema: { tag: tagSchema },
			},
			async (tag) => {
				const user = await requireUser()
				const createdTag = await agent.db.createTag(user.id, tag)
				return {
					structuredContent: { tag: createdTag },
					content: [
						createTextContent(
							`Tag "${createdTag.name}" created successfully with ID "${createdTag.id}"`,
						),
						createTagResourceContent(createdTag),
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
				},
				inputSchema: {
					id: z.number().describe('The ID of the tag'),
				},
				outputSchema: { tag: tagSchema },
			},
			async ({ id }) => {
				const user = await requireUser()
				const tag = await agent.db.getTag(user.id, id)
				invariant(tag, `Tag ID "${id}" not found`)
				return {
					structuredContent: { tag },
					content: [
						createTextContent(JSON.stringify(tag, null, 2)),
						createTagResourceContent(tag),
					],
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
				},
				outputSchema: {
					tags: z.array(tagSchema),
				},
			},
			async () => {
				const user = await requireUser()
				const tags = await agent.db.getTags(user.id)
				return {
					structuredContent: { tags },
					content: [createTextContent(JSON.stringify({ tags }, null, 2))],
				}
			},
		),
		agent.server.registerTool(
			'update_tag',
			{
				title: 'Update Tag',
				description: 'Update a tag',
				annotations: {
					destructiveHint: false,
					idempotentHint: true,
					openWorldHint: false,
				},
				inputSchema: {
					id: z.number(),
					...Object.fromEntries(
						Object.entries(createTagInputSchema).map(([key, value]) => [
							key,
							value.nullable().optional(),
						]),
					),
				},
				outputSchema: { tag: tagSchema },
			},
			async ({ id, ...updates }) => {
				const user = await requireUser()
				const updatedTag = await agent.db.updateTag(user.id, id, updates)
				return {
					structuredContent: { tag: updatedTag },
					content: [
						createTextContent(
							`Tag "${updatedTag.name}" (ID: ${id}) updated successfully`,
						),
						createTagResourceContent(updatedTag),
					],
				}
			},
		),
		agent.server.registerTool(
			'delete_tag',
			{
				title: 'Delete Tag',
				description: 'Delete a tag',
				annotations: {
					idempotentHint: true,
					openWorldHint: false,
				},
				inputSchema: {
					id: z.number().describe('The ID of the tag'),
				},
				outputSchema: {
					success: z.boolean(),
					message: z.string(),
					tag: tagSchema,
				},
			},
			async ({ id }) => {
				const user = await requireUser()
				const existingTag = await agent.db.getTag(user.id, id)
				invariant(existingTag, `Tag ID "${id}" not found`)
				await agent.db.deleteTag(user.id, id)
				const structuredContent = {
					success: true,
					message: `Tag "${existingTag.name}" (ID: ${id}) deleted successfully`,
					tag: existingTag,
				}
				return {
					structuredContent,
					content: [
						createTextContent(structuredContent.message),
						createTagResourceContent(existingTag),
					],
				}
			},
		),
		agent.server.registerTool(
			'add_tag_to_entry',
			{
				title: 'Add Tag to Entry',
				description: 'Add a tag to an entry',
				annotations: {
					destructiveHint: false,
					idempotentHint: true,
					openWorldHint: false,
				},
				inputSchema: {
					entryId: z.number().describe('The ID of the entry'),
					tagId: z.number().describe('The ID of the tag'),
				},
				outputSchema: {
					success: z.boolean(),
					message: z.string(),
					entryTag: entryTagSchema,
				},
			},
			async ({ entryId, tagId }) => {
				const user = await requireUser()
				const tag = await agent.db.getTag(user.id, tagId)
				const entry = await agent.db.getEntry(user.id, entryId)
				invariant(tag, `Tag ${tagId} not found`)
				invariant(entry, `Entry with ID "${entryId}" not found`)
				const entryTag = await agent.db.addTagToEntry(user.id, {
					entryId,
					tagId,
				})
				const structuredContent = {
					success: true,
					message: `Tag "${tag.name}" (ID: ${entryTag.tagId}) added to entry "${entry.title}" (ID: ${entryTag.entryId}) successfully`,
					entryTag,
				}
				return {
					structuredContent,
					content: [createTextContent(structuredContent.message)],
				}
			},
		),
	]

	async function requireGrantId() {
		const { grantId } = agent.props
		invariant(grantId, 'You must be logged in to perform this action')
		const grant = await agent.db.getGrant(grantId)
		invariant(
			grant,
			'The given grant is invalid (no matching grant in the database)',
		)
		return grant
	}

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

function createTextContent(text: unknown): CallToolResult['content'][number] {
	if (typeof text === 'string') {
		return { type: 'text', text }
	} else {
		return { type: 'text', text: JSON.stringify(text, null, 2) }
	}
}

type ResourceContent = CallToolResult['content'][number]

// Helper to create an embedded resource content item for an entry
function createEntryResourceContent(entry: { id: number }): ResourceContent {
	return {
		type: 'resource',
		resource: {
			uri: `epicme://entries/${entry.id}`,
			mimeType: 'application/json',
			text: JSON.stringify(entry),
		},
	}
}

// Helper to create an embedded resource content item for a tag
function createTagResourceContent(tag: { id: number }): ResourceContent {
	return {
		type: 'resource',
		resource: {
			uri: `epicme://tags/${tag.id}`,
			mimeType: 'application/json',
			text: JSON.stringify(tag),
		},
	}
}
