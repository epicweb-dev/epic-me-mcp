// Helper function to format SQL queries
export function sql(strings: TemplateStringsArray, ...values: Array<string>) {
	const joined = strings.reduce((result, str, i) => {
		return result + str + (values[i] || '')
	}, '')
	return joined
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.join(' ')
}

export function snakeToCamel<T extends Record<string, unknown>>(obj: T) {
	const entries = Object.entries(obj).map(([key, value]) => {
		const camelKey = key.replace(/_([a-z])/g, (_, letter) =>
			letter.toUpperCase(),
		)
		return [camelKey, value]
	})
	return Object.fromEntries(entries) as {
		[K in keyof T as K extends string
			? K extends `${string}_${string}`
				? never
				: K
			: K]: T[K]
	} & {
		[K in keyof T as K extends `${infer Start}_${infer Letter}${infer Rest}`
			? `${Start}${Uppercase<Letter>}${Rest}`
			: never]: T[K]
	}
}
