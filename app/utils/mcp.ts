import { useEffect } from 'react'
import { type z } from 'zod'

export function useMcpUiInit() {
	useEffect(() => {
		window.parent.postMessage({ type: 'ui-lifecycle-iframe-ready' }, '*')

		const height = document.documentElement.scrollHeight
		const width = document.documentElement.scrollWidth

		window.parent.postMessage(
			{ type: 'ui-size-change', payload: { height, width } },
			'*',
		)
	}, [])
}

type MessageOptions = {
	schema?: z.ZodSchema
	signal?: AbortSignal
	timeoutMs?: number
}

type McpMessageReturnType<Options> = Promise<
	Options extends { schema: z.ZodSchema } ? z.infer<Options['schema']> : unknown
>

type McpMessageTypes = {
	tool: { toolName: string; params: Record<string, unknown> }
	prompt: { prompt: string }
	link: { url: string }
}

type McpMessageType = keyof McpMessageTypes

function sendMcpMessage<Options extends MessageOptions>(
	type: 'tool',
	payload: McpMessageTypes['tool'],
	options?: Options,
): McpMessageReturnType<Options>

function sendMcpMessage<Options extends MessageOptions>(
	type: 'prompt',
	payload: McpMessageTypes['prompt'],
	options?: Options,
): McpMessageReturnType<Options>

function sendMcpMessage<Options extends MessageOptions>(
	type: 'link',
	payload: McpMessageTypes['link'],
	options?: Options,
): McpMessageReturnType<Options>

function sendMcpMessage<TypeType extends McpMessageType>(
	type: TypeType,
	payload: McpMessageTypes[TypeType],
	options: MessageOptions = {},
): McpMessageReturnType<typeof options> {
	const { signal: givenSignal, schema, timeoutMs = 3_000 } = options
	const timeoutSignal =
		typeof timeoutMs === 'number' ? AbortSignal.timeout(timeoutMs) : undefined
	const signals = [givenSignal, timeoutSignal].filter(Boolean)
	const signal = signals.length > 0 ? AbortSignal.any(signals) : undefined

	const messageId = crypto.randomUUID()

	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error('Operation aborted before it began'))
			return
		}

		if (!window.parent || window.parent === window) {
			console.log(`[MCP] No parent frame available. Would have sent message:`, {
				type,
				messageId,
				payload,
			})
			reject(new Error('No parent frame available'))
			return
		}

		console.log('posting to parent', { type, messageId, payload })
		window.parent.postMessage({ type, messageId, payload }, '*')

		function handleMessage(event: MessageEvent) {
			if (event.data.type === 'ui-message-response') {
				const {
					messageId: responseMessageId,
					payload: { response, error },
				} = event.data
				if (responseMessageId === messageId) {
					window.removeEventListener('message', handleMessage)

					if (error) return reject(new Error(error))

					if (!schema) return resolve(response)

					const parseResult = schema.safeParse(response)
					if (!parseResult.success) {
						return reject(new Error(parseResult.error.message))
					}
					return resolve(parseResult.data)
				}
			}
		}

		window.addEventListener('message', handleMessage, { signal })
	})
}

export { sendMcpMessage }

export function waitForRenderData<RenderData>(
	schema: z.ZodSchema<RenderData>,
): Promise<RenderData> {
	return new Promise((resolve, reject) => {
		window.parent.postMessage({ type: 'ui-lifecycle-iframe-ready' }, '*')

		function handleMessage(event: MessageEvent) {
			if (event.data?.type !== 'ui-lifecycle-iframe-render-data') return
			window.removeEventListener('message', handleMessage)

			const { renderData, error } = event.data.payload

			if (error) return reject(error)
			if (!schema) return resolve(renderData)

			const parseResult = schema.safeParse(renderData)
			if (!parseResult.success) return reject(parseResult.error)

			return resolve(parseResult.data)
		}

		window.addEventListener('message', handleMessage)
	})
}
