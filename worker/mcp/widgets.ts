import { type ZodRawShape, z } from 'zod'
import { type EpicMeMCP } from './index.ts'

declare const BUILD_VERSION: string
const version = BUILD_VERSION

type WidgetOutput<Output extends ZodRawShape> = {
	outputSchema: Output
	getStructuredContent: () => Promise<{
		[Key in keyof Output]: z.infer<Output[Key]>
	}>
}

type Widget<Output extends ZodRawShape> = {
	name: string
	title: string
	route: string
	resultMessage: string
	description?: string
	invokingMessage?: string
	invokedMessage?: string
	widgetAccessible?: boolean
	widgetPrefersBorder?: boolean
	resultCanProduceWidget?: boolean
	inputSchema?: ZodRawShape
} & WidgetOutput<Output>

function createWidget<Output extends ZodRawShape>(
	widget: Widget<Output>,
): Widget<Output> {
	return widget
}

const widgets = [
	createWidget({
		name: 'test-react-router',
		title: 'Test React Router',
		route: '/',
		// route: '/ui/test',
		description:
			'Renders an interactive test widget displaying the structured content passed from the tool, including a message confirming successful data transfer.',
		invokingMessage: 'Getting you the test widget',
		invokedMessage: `Here's the test widget`,
		resultMessage: 'The test widget has been rendered',
		widgetAccessible: true,
		resultCanProduceWidget: true,
		outputSchema: {
			message: z.string(),
		},
		getStructuredContent: async () => ({
			message: 'Successfully passed structured content to the widget',
		}),
	}),
]

export async function registerWidgets(agent: EpicMeMCP) {
	for (const widget of widgets) {
		const baseUrl = agent.requireDomain()
		const name = `${widget.name}-${version}`
		const uri = `ui://widget/${name}.html`
		const url = new URL(widget.route, baseUrl)
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
			async () => {
				return {
					content: [{ type: 'text', text: widget.resultMessage }],
					structuredContent: widget.getStructuredContent
						? await widget.getStructuredContent()
						: {},
				}
			},
		)
	}
}
