import { invariant } from '@epic-web/invariant'
import { type ZodRawShape, z } from 'zod'
import { entryWithTagsSchema } from '#worker/db/schema.ts'
import { type EpicMeMCP } from './index.ts'

declare const BUILD_TIMESTAMP: string
const version = BUILD_TIMESTAMP

type WidgetOutput<Input extends ZodRawShape, Output extends ZodRawShape> = {
	inputSchema: Input
	outputSchema: Output
	getStructuredContent: (args: {
		[Key in keyof Input]: z.infer<Input[Key]>
	}) => Promise<{
		[Key in keyof Output]: z.infer<Output[Key]>
	}>
}

type Widget<Input extends ZodRawShape, Output extends ZodRawShape> = {
	name: string
	title: string
	resultMessage: string
	description?: string
	invokingMessage?: string
	invokedMessage?: string
	widgetAccessible?: boolean
	widgetPrefersBorder?: boolean
	resultCanProduceWidget?: boolean
} & WidgetOutput<Input, Output>

function createWidget<Input extends ZodRawShape, Output extends ZodRawShape>(
	widget: Widget<Input, Output>,
): Widget<Input, Output> {
	return widget
}

export async function registerWidgets(agent: EpicMeMCP) {
	const widgets = [
		createWidget({
			name: 'view_entry',
			title: 'View Entry',
			description:
				'Renders an interactive user interface to view a journal entry',
			invokingMessage: 'Retrieving your journal entry',
			invokedMessage: `Here's your journal entry`,
			resultMessage: 'The journal entry has been rendered',
			widgetAccessible: true,
			resultCanProduceWidget: true,
			inputSchema: { id: z.number().describe('The ID of the entry') },
			outputSchema: { entry: entryWithTagsSchema },
			getStructuredContent: async ({ id }) => {
				const user = await agent.requireUser()
				const entry = await agent.db.getEntry(user.id, id)
				invariant(
					entry,
					`Entry with ID "${id}" not found for user with id "${user.id}"`,
				)
				return { entry }
			},
		}),
	]

	for (const widget of widgets) {
		const baseUrl = agent.requireDomain()
		const name = `${widget.name}-${version}`
		const uri = `ui://widget/${name}.html`
		// chat gpt hosts your app on their own server and serves it at /index.html
		const url = new URL('/index.html', baseUrl)
		// the version is to avoid chatgpt caching between deployments
		url.searchParams.set('v', version.toString())

		agent.server.registerResource(name, uri, {}, async () => ({
			contents: [
				{
					uri,
					mimeType: 'text/html+skybridge',
					text: await fetch(url).then(async (res) => await res.text()),
					_meta: {
						'openai/widgetDescription': widget.description,
						'openai/widgetCSP': {
							connect_domains: [],
							resource_domains: [baseUrl],
						},
						...(widget.widgetPrefersBorder
							? { 'openai/widgetPrefersBorder': true }
							: {}),
					},
				},
			],
		}))

		agent.server.registerTool(
			name,
			{
				title: widget.title,
				description: widget.description,
				_meta: {
					'openai/widgetDomain': baseUrl,
					'openai/outputTemplate': uri,
					'openai/toolInvocation/invoking': widget.invokingMessage,
					'openai/toolInvocation/invoked': widget.invokedMessage,
					...(widget.resultCanProduceWidget
						? { 'openai/resultCanProduceWidget': true }
						: {}),
					...(widget.widgetAccessible
						? { 'openai/widgetAccessible': true }
						: {}),
				},
				inputSchema: widget.inputSchema,
				outputSchema: widget.outputSchema,
			},
			async (args) => {
				return {
					content: [{ type: 'text', text: widget.resultMessage }],
					structuredContent: widget.getStructuredContent
						? await widget.getStructuredContent(args)
						: {},
				}
			},
		)
	}
}
