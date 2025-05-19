import { z } from 'zod'

// Helper to transform timestamps from SQLite's datetime format
const timestampSchema = z.preprocess((val) => {
	if (typeof val === 'string') {
		// SQLite datetime format: YYYY-MM-DD HH:MM:SS
		const date = new Date(val.replace(' ', 'T'))
		const timestamp = date.getTime() / 1000
		return isNaN(timestamp) ? null : timestamp
	}
	return val
}, z.number())

export const userSchema = z.object({
	id: z.coerce.number(),
	email: z.string(),
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
})

export const grantSchema = z.object({
	id: z.coerce.number(),
	grantUserId: z.string(),
	userId: z.coerce.number().optional(),
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
})

export const validationTokenSchema = z.object({
	id: z.coerce.number(),
	tokenValue: z.string(),
	email: z.string().email(),
	grantId: z.coerce.number(),
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
})

// Schema Validation
export const entrySchema = z.object({
	id: z.coerce.number(),
	userId: z.coerce.number(),
	title: z.string(),
	content: z.string(),
	mood: z.string().nullable(),
	location: z.string().nullable(),
	weather: z.string().nullable(),
	isPrivate: z.coerce.number(),
	isFavorite: z.coerce.number(),
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
})

export const newEntrySchema = z.object({
	title: z.string(),
	content: z.string(),
	mood: z.string().optional().nullable().default(null),
	location: z.string().optional().nullable().default(null),
	weather: z.string().optional().nullable().default(null),
	isPrivate: z.number().optional().default(1),
	isFavorite: z.number().optional().default(0),
})

export const tagSchema = z.object({
	id: z.coerce.number(),
	userId: z.coerce.number(),
	name: z.string(),
	description: z.string().nullable(),
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
})

export const newTagSchema = z.object({
	name: z.string(),
	description: z.string().nullable().optional(),
})

export const entryTagSchema = z.object({
	id: z.coerce.number(),
	userId: z.coerce.number(),
	entryId: z.coerce.number(),
	tagId: z.coerce.number(),
	createdAt: timestampSchema,
	updatedAt: timestampSchema,
})

export const newEntryTagSchema = z.object({
	entryId: z.number(),
	tagId: z.number(),
})

export const createEntryInputSchema = {
	title: z.string().describe('The title of the entry'),
	content: z.string().describe('The content of the entry'),
	mood: z
		.string()
		.optional()
		.describe(
			'The mood of the entry (for example: "happy", "sad", "anxious", "excited")',
		),
	location: z
		.string()
		.optional()
		.describe(
			'The location of the entry (for example: "home", "work", "school", "park")',
		),
	weather: z
		.string()
		.optional()
		.describe(
			'The weather of the entry (for example: "sunny", "cloudy", "rainy", "snowy")',
		),
	isPrivate: z
		.number()
		.optional()
		.default(1)
		.describe('Whether the entry is private (1 for private, 0 for public)'),
	isFavorite: z
		.number()
		.optional()
		.default(0)
		.describe(
			'Whether the entry is a favorite (1 for favorite, 0 for not favorite)',
		),
	tags: z
		.array(z.number())
		.optional()
		.describe('The IDs of the tags to add to the entry'),
}

export const createTagInputSchema = {
	name: z.string().describe('The name of the tag'),
	description: z.string().optional().describe('The description of the tag'),
}

export type Entry = z.infer<typeof entrySchema>
export type NewEntry = z.infer<typeof newEntrySchema>
export type Tag = z.infer<typeof tagSchema>
export type NewTag = z.infer<typeof newTagSchema>
export type EntryTag = z.infer<typeof entryTagSchema>
export type NewEntryTag = z.infer<typeof newEntryTagSchema>
