import { invariant } from '@epic-web/invariant'
import { z } from 'zod'
import { type EpicMeMCP } from './index.ts'

type Entry = NonNullable<Awaited<ReturnType<EpicMeMCP['db']['getEntry']>>>

export async function suggestTagsSampling(
	userId: number,
	agent: EpicMeMCP,
	entryId: number,
) {
	const clientCapabilities = agent.server.server.getClientCapabilities()
	if (!clientCapabilities?.sampling) {
		console.error('Client does not support sampling, skipping sampling request')
		return
	}

	const entry = await agent.db.getEntry(userId, entryId)
	invariant(entry, `Entry with ID "${entryId}" not found`)

	const existingTags = await agent.db.getTags(userId)
	const currentTags = await agent.db.getEntryTags(userId, entry.id)

	const result = await agent.server.server.createMessage({
		systemPrompt: `
You are an AI assistant that suggests relevant tags for journal entries to improve organization and discoverability.

## Your Task
Analyze the journal entry and suggest appropriate tags from existing ones or create new ones.

## Rules
- Suggest 0-5 tags maximum (it's fine to suggest none)
- Only suggest tags not already applied to this entry
- Prioritize existing tags when they're relevant
- Create new tags only when they add significant value

## Response Format
Respond with JSON only. Use this exact structure:

For no suggestions: []
For suggestions: [{"id": 1, "confidence": 0.9, "reasoning": "Entry mentions work meetings"}, {"name": "New Tag", "description": "Brief description", "confidence": 0.7, "reasoning": "Content shows stress patterns"}]

## Examples
- Existing tag: {"id": 1, "confidence": 0.9, "reasoning": "Entry discusses work-related activities"}
- New tag: {"name": "Work Project", "description": "Professional work-related content", "confidence": 0.8, "reasoning": "Mentions deadlines and meetings"}

## Tag Selection Guidelines
- Choose tags that help categorize the entry's main themes
- Consider emotional content, activities, people, locations, or topics
- Avoid overly specific tags that won't be reused
- Prefer broader, reusable tags over very specific ones

## Validation
- Existing tag IDs must be valid numbers
- New tag names should be 1-3 words, descriptive but concise
- Descriptions should be brief (1-2 sentences max)
- Confidence scores should be between 0.0 and 1.0
- Reasoning should explain why the tag is relevant to this entry
	`.trim(),
		messages: [
			{
				role: 'user',
				content: {
					type: 'text',
					mimeType: 'application/json',
					text: JSON.stringify({ entry, currentTags, existingTags }),
				},
			},
		],
		maxTokens: 100,
	})

	const { suggestedNewTags, suggestedExistingTags } =
		await parseAndProcessTagSuggestions({
			userId,
			agent,
			result,
			existingTags,
			currentTags,
		})

	// Separate high-confidence tags (auto-apply) from low-confidence tags (ask user)
	const highConfidenceTags: SuggestedTag[] = []
	const lowConfidenceTags: SuggestedTag[] = []

	// Process existing tag suggestions
	for (const tag of suggestedExistingTags) {
		if (tag.confidence >= 0.7) {
			highConfidenceTags.push(tag)
		} else {
			lowConfidenceTags.push(tag)
		}
	}

	// Process new tag suggestions
	for (const tag of suggestedNewTags) {
		if (tag.confidence >= 0.7) {
			highConfidenceTags.push(tag)
		} else {
			lowConfidenceTags.push(tag)
		}
	}

	// Auto-apply high-confidence tags
	for (const tag of highConfidenceTags) {
		if ('id' in tag) {
			await agent.db.addTagToEntry(userId, {
				entryId: entry.id,
				tagId: tag.id,
			})
		} else {
			// Create new tag and add to entry
			const newTag = await agent.db.createTag(userId, {
				name: tag.name,
				description: tag.description,
			})
			await agent.db.addTagToEntry(userId, {
				entryId: entry.id,
				tagId: newTag.id,
			})
		}
	}

	// Handle low-confidence tags with elicitation (fire-and-forget)
	if (lowConfidenceTags.length > 0) {
		void handleLowConfidenceTags({ agent, userId, lowConfidenceTags, entry })
	}

	const allTags = await agent.db.getTags(userId)
	const updatedEntry = await agent.db.getEntry(userId, entry.id)

	const addedTags = highConfidenceTags
		.map((tag) => {
			if ('id' in tag) {
				return allTags.find((t) => t.id === tag.id)
			} else {
				return {
					name: tag.name,
					description: tag.description,
					confidence: tag.confidence,
				}
			}
		})
		.filter(Boolean)

	if (['debug', 'info'].includes(agent.state.loggingLevel)) {
		void agent.server.server.sendLoggingMessage({
			level: 'info',
			data: {
				message: 'Auto-applied high-confidence tags to entry',
				addedTags,
				entry: updatedEntry,
				highConfidenceCount: highConfidenceTags.length,
				lowConfidenceCount: lowConfidenceTags.length,
			},
		})
	}
}

const existingTagSchema = z.object({
	id: z.number(),
	confidence: z.number().min(0).max(1),
	reasoning: z.string(),
})
const newTagSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	confidence: z.number().min(0).max(1),
	reasoning: z.string(),
})

type ExistingSuggestedTag = z.infer<typeof existingTagSchema>
type NewSuggestedTag = z.infer<typeof newTagSchema>
type SuggestedTag = ExistingSuggestedTag | NewSuggestedTag

function isExistingTagSuggestion(
	tag: SuggestedTag,
	existingTags: Array<{ id: number; name: string }>,
	currentTags: Array<{ id: number; name: string }>,
): tag is ExistingSuggestedTag {
	return (
		'id' in tag &&
		existingTags.some((t) => t.id === tag.id) &&
		!currentTags.some((t) => t.id === tag.id)
	)
}

function isNewTagSuggestion(
	tag: SuggestedTag,
	existingTags: Array<{ id: number; name: string }>,
): tag is NewSuggestedTag {
	return 'name' in tag && existingTags.every((t) => t.name !== tag.name)
}

async function parseAndProcessTagSuggestions({
	userId,
	agent,
	result,
	existingTags,
	currentTags,
}: {
	userId: number
	agent: EpicMeMCP
	result: unknown
	existingTags: Array<{ id: number; name: string }>
	currentTags: Array<{ id: number; name: string }>
}) {
	const resultSchema = z.object({
		content: z.object({
			type: z.literal('text'),
			text: z.string(),
		}),
	})

	const parsedResult = resultSchema.parse(result)

	const responseSchema = z.array(z.union([existingTagSchema, newTagSchema]))

	const suggestedTags = responseSchema.parse(
		JSON.parse(parsedResult.content.text),
	)

	// First, resolve any name-based suggestions that match existing tags to their IDs
	const resolvedTags: Array<SuggestedTag> = []
	for (const tag of suggestedTags) {
		if ('name' in tag) {
			const existingTag = existingTags.find((t) => t.name === tag.name)
			if (existingTag) {
				// Preserve the confidence and reasoning from the original suggestion
				resolvedTags.push({
					id: existingTag.id,
					confidence: tag.confidence,
					reasoning: tag.reasoning,
				})
				continue
			}
		}
		resolvedTags.push(tag)
	}

	const suggestedNewTags = resolvedTags.filter((tag) =>
		isNewTagSuggestion(tag, existingTags),
	)
	const suggestedExistingTags = resolvedTags.filter((tag) =>
		isExistingTagSuggestion(tag, existingTags, currentTags),
	)

	const idsToAdd = new Set<number>(suggestedExistingTags.map((t) => t.id))

	if (suggestedNewTags.length > 0) {
		for (const tag of suggestedNewTags) {
			const newTag = await agent.db.createTag(userId, tag)
			idsToAdd.add(newTag.id)
		}
	}

	return { suggestedNewTags, suggestedExistingTags }
}

// Utility function to handle low-confidence tag suggestions with elicitation
async function handleLowConfidenceTags({
	agent,
	userId,
	lowConfidenceTags,
	entry,
}: {
	agent: EpicMeMCP
	userId: number
	lowConfidenceTags: SuggestedTag[]
	entry: Entry
}) {
	const capabilities = agent.server.server.getClientCapabilities()
	if (!capabilities?.elicitation) {
		return // Client doesn't support elicitation
	}

	// Get all tags to resolve names for existing tag IDs
	const allTags = await agent.db.getTags(userId)

	try {
		const message = `I found some tag suggestions for your journal entry "${entry.title}" that I'm not very confident about:\n\nWould you like me to apply any of these tags to your entry?`

		// Create a schema with a boolean for each tag
		const tagChoicesSchema: Record<string, any> = {}

		// Build the schema dynamically based on the tags
		for (let i = 0; i < lowConfidenceTags.length; i++) {
			const tag = lowConfidenceTags[i]
			if (!tag) continue

			if ('id' in tag) {
				const existingTag = allTags.find((t) => t.id === tag.id)
				const tagName = existingTag
					? existingTag.name
					: `Unknown Tag (ID: ${tag.id})`
				tagChoicesSchema[`suggestion_${i}`] = {
					type: 'boolean',
					description: `Apply tag "${tagName}" (confidence: ${tag.confidence}): ${tag.reasoning}`,
				}
			} else {
				tagChoicesSchema[`suggestion_${i}`] = {
					type: 'boolean',
					description: `Create and apply new tag "${tag.name}" (confidence: ${tag.confidence}): ${tag.reasoning}`,
				}
			}
		}

		const result = await agent.elicitInput({
			message,
			requestedSchema: {
				type: 'object',
				properties: tagChoicesSchema,
			},
		})

		if (result.action !== 'accept') return

		// Create a Zod schema for the elicitation response
		const elicitationResponseSchema: Record<string, any> = {}
		for (let i = 0; i < lowConfidenceTags.length; i++) {
			elicitationResponseSchema[`suggestion_${i}`] = z.boolean().optional()
		}

		const responseSchema = z.object(elicitationResponseSchema)
		const parsedResponse = responseSchema.parse(result.content || {})

		// Process the user's choices
		for (const [key, shouldApply] of Object.entries(parsedResponse)) {
			if (shouldApply && key.startsWith('suggestion_')) {
				const suggestionIndex = parseInt(key.replace('suggestion_', ''))
				const tag = lowConfidenceTags[suggestionIndex]

				if (!tag) continue

				if ('id' in tag) {
					// Existing tag
					await agent.db.addTagToEntry(userId, {
						entryId: entry.id,
						tagId: tag.id,
					})
				} else {
					// New tag
					const newTag = await agent.db.createTag(userId, {
						name: tag.name,
						description: tag.description,
					})
					await agent.db.addTagToEntry(userId, {
						entryId: entry.id,
						tagId: newTag.id,
					})
				}
			}
		}
	} catch (error) {
		// Log error but don't fail the main flow
		console.error('Error in low-confidence tag elicitation:', error)
	}
}
