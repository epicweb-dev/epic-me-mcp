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

	const resultSchema = z.object({
		content: z.object({
			type: z.literal('text'),
			text: z.string(),
		}),
	})

	const parsedResult = resultSchema.parse(result)

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
	): tag is ExistingSuggestedTag {
		return (
			'id' in tag &&
			existingTags.some((t) => t.id === tag.id) &&
			!currentTags.every((t) => t.id !== tag.id)
		)
	}

	function isNewTagSuggestion(tag: SuggestedTag): tag is NewSuggestedTag {
		return 'name' in tag && existingTags.every((t) => t.name !== tag.name)
	}

	const responseSchema = z.array(z.union([existingTagSchema, newTagSchema]))

	const suggestedTags = responseSchema.parse(
		JSON.parse(parsedResult.content.text),
	)

	const suggestedNewTags = suggestedTags.filter(isNewTagSuggestion)
	const suggestedExistingTags = suggestedTags.filter(isExistingTagSuggestion)

	const idsToAdd = new Set<number>(suggestedExistingTags.map((t) => t.id))

	if (suggestedNewTags.length > 0) {
		for (const tag of suggestedNewTags) {
			const newTag = await agent.db.createTag(userId, tag)
			idsToAdd.add(newTag.id)
		}
	}

	for (const tagId of idsToAdd) {
		await agent.db.addTagToEntry(userId, {
			entryId: entry.id,
			tagId,
		})
	}

	const allTags = await agent.db.getTags(userId)

	console.log(
		`Sampling added tags to entry ${entry.id} for user ${userId}:`,
		Array.from(idsToAdd)
			.map((id) => allTags.find((t) => t.id === id))
			.filter(Boolean)
			.map((t) => `${t.name} (${t.id})`)
			.join(', '),
	)
}
