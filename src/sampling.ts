import { invariant } from '@epic-web/invariant'
import { z } from 'zod'
import { type EpicMeMCP } from './index.ts'

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
You are a helpful assistant that suggests relevant tags for journal entries to make them easier to categorize and find later.
You will be provided with a journal entry, it's current tags, and all existing tags.
Only suggest tags that are not already applied to this entry.
Journal entries should not have more than 4-5 tags and it's perfectly fine to not have any tags at all.
Feel free to suggest new tags that are not currently in the database and they will be created.

You will respond with JSON only.
Example responses:
If you have no suggestions, respond with an empty array:
[]

If you have some suggestions, respond with an array of tag objects. Existing tags have an "id" property, new tags have a "name" and "description" property:
[{"id": 1}, {"name": "New Tag", "description": "The description of the new tag"}, {"id": 24}]
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

	const { idsToAdd } = await parseAndProcessTagSuggestions({
		userId,
		agent,
		result,
		existingTags,
		currentTags,
	})

	for (const tagId of idsToAdd) {
		await agent.db.addTagToEntry(userId, {
			entryId: entry.id,
			tagId,
		})
	}

	const allTags = await agent.db.getTags(userId)
	const updatedEntry = await agent.db.getEntry(userId, entry.id)

	const addedTags = Array.from(idsToAdd)
		.map((id) => allTags.find((t) => t.id === id))
		.filter(Boolean)

	void agent.server.server.sendLoggingMessage({
		level: 'info',
		data: {
			message: 'Added tags to entry',
			addedTags,
			entry: updatedEntry,
		},
	})
}

const existingTagSchema = z.object({ id: z.number() })
const newTagSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
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
				resolvedTags.push({ id: existingTag.id })
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

	return { idsToAdd, suggestedNewTags, suggestedExistingTags }
}
