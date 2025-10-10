import '#app/utils/mcp-ui-compat.client.ts'

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
		if (type === 'tool') {
			return resolve(
				// @ts-expect-error ... we'll make this great eventually
				window.openai.callTool(payload.toolName, payload.params).then((r) => {
					// @ts-expect-error ... we'll make this great eventually
					void window.openai.sendFollowUpMessage({
						// @ts-expect-error ... we'll make this great eventually
						prompt: `I have called ${payload.toolName} with params ${JSON.stringify(payload.params)} and got the following response: ${JSON.stringify(r)}`,
					})
					return r
				}),
			)
		}

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
	let toolOutput = window.openai?.toolOutput
	if (toolOutput) {
		const parseResult = schema.safeParse({ toolOutput })
		if (parseResult.success) {
			return Promise.resolve(parseResult.data)
		}
		throw new Error(parseResult.error.message)
	}

	return new Promise<RenderData>((resolve, reject) => {
		Object.defineProperty(window.openai, 'toolOutput', {
			get() {
				return toolOutput
			},
			set(newValue: any) {
				toolOutput = newValue
				const parseResult = schema.safeParse({ toolOutput })
				if (parseResult.success) {
					resolve(parseResult.data)
				} else {
					reject(new Error(parseResult.error.message))
				}
			},
			configurable: true,
			enumerable: true,
		})
	})
}

declare global {
	interface Window {
		openai?: {
			toolOutput?: any
		}
	}
}
