import { sendMcpMessage } from '#app/utils/mcp.ts'
import '../utils/mcp-ui-compat.client.ts'

import { type Route } from './+types/index.html.tsx'

export function clientLoader() {
	let toolOutput = window.openai?.toolOutput
	if (toolOutput) return { toolOutput }

	return new Promise<{ toolOutput: string }>((resolve) => {
		Object.defineProperty(window.openai, 'toolOutput', {
			get() {
				return toolOutput
			},
			set(newValue: any) {
				toolOutput = newValue
				resolve({ toolOutput: toolOutput ?? 'No tool output' })
			},
			configurable: true,
			enumerable: true,
		})
	})
}

export default function MCPUIWidget({ loaderData }: Route.ComponentProps) {
	const { toolOutput } = loaderData
	return (
		<div>
			<h1 className="text-h1">This is a test widget.</h1>
			<p>Tool output:</p>
			<pre>{JSON.stringify(toolOutput, null, 2)}</pre>
			<button
				onClick={() =>
					sendMcpMessage('prompt', { prompt: 'Hello, how are you?' })
				}
			>
				Prompt me
			</button>
		</div>
	)
}

declare global {
	interface Window {
		openai?: {
			toolOutput: string
		}
	}
}

export function HydrateFallback() {
	return (
		<div className="flex min-h-48 flex-col items-center justify-center py-12">
			<svg
				className="text-muted-foreground mb-4 h-8 w-8 animate-spin"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				aria-label="Loading"
			>
				<circle
					className="opacity-25"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					strokeWidth="4"
				/>
				<path
					className="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
				/>
			</svg>
			<p className="text-muted-foreground text-lg">
				Waiting for tool output...
			</p>
		</div>
	)
}
