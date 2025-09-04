import { useEffect, useState } from 'react'
import { type z } from 'zod'

// Module-level queue for render data events
const renderDataQueue: Array<{ type: string; payload: any }> = []

// Set up global listener immediately when module loads
window.addEventListener(
	'message',
	(event) => {
		if (event.data?.type === 'ui-lifecycle-iframe-render-data') {
			renderDataQueue.push(event.data)
		}
	},
	{ once: false },
)

export function useMcpUiInit() {
	useEffect(() => {
		window.parent.postMessage({ type: 'ui-lifecycle-iframe-ready' }, '*')

		requestAnimationFrame(() => {
			notifyParentOfCurrentDocumentSize()
		})
	}, [])
}

export function notifyParentOfCurrentDocumentSize() {
	const height = document.documentElement.scrollHeight
	const width = document.documentElement.scrollWidth

	window.parent.postMessage(
		{
			type: 'ui-size-change',
			payload: {
				height: height + 2,
				width: width,
			},
		},
		'*',
	)
}

function willSubmitEventFire() {
	const form = document.createElement('form')
	form.noValidate = true
	form.style.display = 'none'
	document.body.appendChild(form)

	let fired = false
	form.addEventListener(
		'submit',
		(e) => {
			fired = true
			e.preventDefault()
		},
		{ capture: true, once: true },
	)

	try {
		form.requestSubmit() // fires 'submit' synchronously if allowed
	} finally {
		form.remove()
	}

	return fired // true => submit event dispatched (forms allowed)
}

export function useFormSubmissionCapability() {
	const [canUseOnSubmit, setCanUseOnSubmit] = useState(false)

	useEffect(() => {
		const canSubmit = willSubmitEventFire()
		setCanUseOnSubmit(canSubmit)
	}, [])

	return canUseOnSubmit
}

export function callTool(
	toolName: string,
	params: any,
	signal?: AbortSignal,
): Promise<any> {
	const messageId = crypto.randomUUID()

	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error('Operation aborted'))
			return
		}

		// Send tool call with messageId
		window.parent.postMessage(
			{
				type: 'tool',
				messageId,
				payload: {
					toolName,
					params,
				},
			},
			'*',
		)

		function handleMessage(event: MessageEvent) {
			if (event.data.type === 'ui-message-response') {
				console.log(event)
				const {
					messageId: responseMessageId,
					payload: { response, error },
				} = event.data
				if (responseMessageId === messageId) {
					window.removeEventListener('message', handleMessage)

					if (error) {
						reject(new Error(error))
					} else {
						resolve(response)
					}
				}
			}
		}

		window.addEventListener('message', handleMessage, { signal })
	})
}

export function sendPrompt(
	prompt: string,
	signal?: AbortSignal,
): Promise<void> {
	const messageId = crypto.randomUUID()

	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error('Operation aborted'))
			return
		}

		// Send prompt with messageId
		window.parent.postMessage(
			{
				type: 'prompt',
				messageId,
				payload: {
					prompt,
				},
			},
			'*',
		)

		function handleMessage(event: MessageEvent) {
			if (event.data.type === 'ui-message-response') {
				const {
					messageId: responseMessageId,
					payload: { response, error },
				} = event.data
				if (responseMessageId === messageId) {
					window.removeEventListener('message', handleMessage)

					if (error) {
						reject(new Error(error))
					} else {
						resolve(response)
					}
				}
			}
		}

		window.addEventListener('message', handleMessage, { signal })
	})
}

export function waitForRenderData<RenderData>(
	schema: z.ZodSchema<RenderData>,
	opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<RenderData> {
	const { signal, timeoutMs = 3_000 } = opts

	return new Promise((resolve, reject) => {
		// Check if we already received the data
		const queuedEvent = renderDataQueue.find(
			(event) => event.type === 'ui-lifecycle-iframe-render-data',
		)
		if (queuedEvent) {
			const result = schema.safeParse(queuedEvent.payload.renderData)
			return result.success ? resolve(result.data) : reject(result.error)
		}

		// Otherwise, set up the normal listening logic
		const timeoutSignal =
			typeof timeoutMs === 'number' ? AbortSignal.timeout(timeoutMs) : undefined

		const combined: AbortSignal =
			signal && timeoutSignal
				? AbortSignal.any([signal, timeoutSignal])
				: (signal ?? timeoutSignal ?? new AbortController().signal)

		function cleanup() {
			window.removeEventListener('message', handleMessage)
			combined.removeEventListener?.('abort', onAbort as EventListener)
		}

		function onAbort() {
			cleanup()
			const reason =
				(combined as any).reason ??
				new DOMException('Timed out waiting for render data', 'TimeoutError')
			reject(reason)
		}

		function handleMessage(event: MessageEvent) {
			if (event.data?.type !== 'ui-lifecycle-iframe-render-data') return

			const result = schema.safeParse(event.data.payload)
			cleanup()
			return result.success ? resolve(result.data) : reject(result.error)
		}

		combined.addEventListener('abort', onAbort, { once: true })
		window.addEventListener('message', handleMessage, {
			once: true,
			signal: combined,
		})

		if (combined.aborted) onAbort()
	})
}
