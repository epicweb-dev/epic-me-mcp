import { invariant } from '@epic-web/invariant'
import { generateTOTP } from '@epic-web/totp'
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { createEntryInputSchema, createTagInputSchema } from './db/schema.ts'
import { type EpicMeMCP } from './index.ts'
import { sendEmail } from './utils/email.ts'

export async function initializeTools(agent: EpicMeMCP) {
	agent.unauthenticatedTools = [
		agent.server.tool(
			'authenticate',
			`Authenticate to your account or create a new account. Ask for the user's email address before authenticating. Only do this when explicitely told to do so.`,
			{
				email: z
					.string()
					.email()
					.describe(
						`
The user's email address for their account.

Please ask them explicitely for their email address and don't just guess.
						`.trim(),
					),
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
				return createReply(
					`The user has been sent an email to ${email} with a validation token. Please have the user submit that token using the validate_token tool.`,
				)
			},
		),

		agent.server.tool(
			'validate_token',
			'Validate a token which was emailed',
			{
				validationToken: z
					.string()
					.describe(
						'The validation token the user received in their email inbox from the authenticate tool',
					),
			},
			async ({ validationToken }) => {
				const grant = await requireGrantId()
				const user = await agent.db.validateTokenToGrant(
					grant.id,
					validationToken,
				)

				agent.setState({ userId: user.id })

				return createReply(
					`The user's token has been validated as the owner of the account "${user.email}" (ID: ${user.id}). The user can now execute authenticated tools.`,
				)
			},
		),
	]

	agent.authenticatedTools = [
		// TODO: remove this once clients are better at handling resources
		agent.server.tool(
			'whoami',
			'Get information about the currently logged in user',
			async () => {
				const user = await requireUser()
				return createReply(user)
			},
		),

		agent.server.tool(
			'logout',
			'Remove authentication information',
			async () => {
				const user = await requireUser()
				await agent.db.unclaimGrant(user.id, agent.props.grantId)
				return createReply('Logout successful')
			},
		),

		// Entry Tools
		agent.server.tool(
			'create_entry',
			'Create a new journal entry',
			createEntryInputSchema,
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
					content: [
						createTextContent(
							`Entry "${createdEntry.title}" created successfully with ID "${createdEntry.id}"`,
						),
						createEntryResourceContent(createdEntry),
					],
				}
			},
		),

		agent.server.tool(
			'get_entry',
			'Get a journal entry by ID',
			{
				id: z.number().describe('The ID of the entry'),
			},
			async ({ id }) => {
				const user = await requireUser()
				const entry = await agent.db.getEntry(user.id, id)
				invariant(entry, `Entry with ID "${id}" not found`)
				return {
					content: [
						createTextContent(JSON.stringify(entry, null, 2)),
						createEntryResourceContent(entry),
					],
				}
			},
		),

		agent.server.tool(
			'list_entries',
			'List all journal entries',
			{
				tagIds: z
					.array(z.number())
					.optional()
					.describe('Optional array of tag IDs to filter entries by'),
			},
			async ({ tagIds }) => {
				const user = await requireUser()
				const entries = await agent.db.getEntries(user.id, tagIds)
				return createReply(entries)
			},
		),

		agent.server.tool(
			'update_entry',
			'Update a journal entry. Fields that are not provided (or set to undefined) will not be updated. Fields that are set to null or any other value will be updated.',
			{
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
			async ({ id, ...updates }) => {
				const user = await requireUser()
				const existingEntry = await agent.db.getEntry(user.id, id)
				invariant(existingEntry, `Entry with ID "${id}" not found`)
				const updatedEntry = await agent.db.updateEntry(user.id, id, updates)
				return {
					content: [
						createTextContent(
							`Entry "${updatedEntry.title}" (ID: ${id}) updated successfully`,
						),
						createEntryResourceContent(updatedEntry),
					],
				}
			},
		),

		agent.server.tool(
			'delete_entry',
			'Delete a journal entry',
			{
				id: z.number().describe('The ID of the entry'),
			},
			async ({ id }) => {
				const user = await requireUser()
				const existingEntry = await agent.db.getEntry(user.id, id)
				invariant(existingEntry, `Entry with ID "${id}" not found`)
				await agent.db.deleteEntry(user.id, id)
				return {
					content: [
						createTextContent(
							`Entry "${existingEntry.title}" (ID: ${id}) deleted successfully`,
						),
						createEntryResourceContent(existingEntry),
					],
				}
			},
		),

		// Tag Tools
		agent.server.tool(
			'create_tag',
			'Create a new tag',
			createTagInputSchema,
			async (tag) => {
				const user = await requireUser()
				const createdTag = await agent.db.createTag(user.id, tag)
				return {
					content: [
						createTextContent(
							`Tag "${createdTag.name}" created successfully with ID "${createdTag.id}"`,
						),
						createTagResourceContent(createdTag),
					],
				}
			},
		),

		agent.server.tool(
			'get_tag',
			'Get a tag by ID',
			{
				id: z.number().describe('The ID of the tag'),
			},
			async ({ id }) => {
				const user = await requireUser()
				const tag = await agent.db.getTag(user.id, id)
				invariant(tag, `Tag ID "${id}" not found`)
				return {
					content: [
						createTextContent(JSON.stringify(tag, null, 2)),
						createTagResourceContent(tag),
					],
				}
			},
		),

		agent.server.tool('list_tags', 'List all tags', async () => {
			const user = await requireUser()
			const tags = await agent.db.getTags(user.id)
			return createReply(tags)
		}),

		agent.server.tool(
			'update_tag',
			'Update a tag',
			{
				id: z.number(),
				...Object.fromEntries(
					Object.entries(createTagInputSchema).map(([key, value]) => [
						key,
						value.nullable().optional(),
					]),
				),
			},
			async ({ id, ...updates }) => {
				const user = await requireUser()
				const updatedTag = await agent.db.updateTag(user.id, id, updates)
				return {
					content: [
						createTextContent(
							`Tag "${updatedTag.name}" (ID: ${id}) updated successfully`,
						),
						createTagResourceContent(updatedTag),
					],
				}
			},
		),

		agent.server.tool(
			'delete_tag',
			'Delete a tag',
			{
				id: z.number().describe('The ID of the tag'),
			},
			async ({ id }) => {
				const user = await requireUser()
				const existingTag = await agent.db.getTag(user.id, id)
				invariant(existingTag, `Tag ID "${id}" not found`)
				await agent.db.deleteTag(user.id, id)
				return {
					content: [
						createTextContent(
							`Tag "${existingTag.name}" (ID: ${id}) deleted successfully`,
						),
						createTagResourceContent(existingTag),
					],
				}
			},
		),

		// Entry Tag Tools
		agent.server.tool(
			'add_tag_to_entry',
			'Add a tag to an entry',
			{
				entryId: z.number().describe('The ID of the entry'),
				tagId: z.number().describe('The ID of the tag'),
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
				return createReply(
					`Tag "${tag.name}" (ID: ${entryTag.tagId}) added to entry "${entry.title}" (ID: ${entryTag.entryId}) successfully`,
				)
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

function createReply(text: unknown): CallToolResult {
	if (typeof text === 'string') {
		return { content: [{ type: 'text', text }] }
	} else {
		return {
			content: [{ type: 'text', text: JSON.stringify(text, null, 2) }],
		}
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
