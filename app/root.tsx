import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from 'react-router'

import { type Route } from './+types/root'
import './app.css'

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<ReactRouterChatSDKBootstrap baseUrl="https://epic-me-mcp-staging.kentcdodds.workers.dev" />
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="color-scheme" content="light dark" />
				<Meta />
				<Links />
			</head>
			<body className="bg-background text-foreground relative min-h-screen w-full">
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	)
}

export default function App() {
	return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = 'Oops!'
	let details = 'An unexpected error occurred.'
	let stack: string | undefined

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? '404' : 'Error'
		details =
			error.status === 404
				? 'The requested page could not be found.'
				: error.statusText || details
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message
		stack = error.stack
	}
	console.error(error)

	return (
		<main className="container mx-auto p-4 pt-16">
			<h1>{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre className="w-full overflow-x-auto p-4">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	)
}

// borrowed from https://github.com/vercel-labs/chatgpt-apps-sdk-nextjs-starter/blob/a83b58a440e203a1b204cbf1d7f2c5b1c688811e/app/layout.tsx#L49-L182
// Thanks!
function ReactRouterChatSDKBootstrap({ baseUrl }: { baseUrl: string }) {
	return (
		<>
			<base href={baseUrl}></base>
			{/* <script>{`window.innerBaseUrl = ${JSON.stringify(baseUrl)}`}</script> */}
			<script>
				{'(' +
					(() => {
						// @ts-ignore
						// const baseUrl = window.innerBaseUrl
						const htmlElement = document.documentElement
						const observer = new MutationObserver((mutations) => {
							mutations.forEach((mutation) => {
								if (
									mutation.type === 'attributes' &&
									mutation.target === htmlElement
								) {
									const attrName = mutation.attributeName
									if (attrName && attrName !== 'suppresshydrationwarning') {
										htmlElement.removeAttribute(attrName)
									}
								}
							})
						})
						observer.observe(htmlElement, {
							attributes: true,
							attributeOldValue: true,
						})

						const originalReplaceState = history.replaceState
						history.replaceState = (s, unused, url) => {
							const u = new URL(url ?? '', window.location.href)
							const href = u.pathname + u.search + u.hash
							originalReplaceState.call(history, unused, href)
						}

						const originalPushState = history.pushState
						history.pushState = (s, unused, url) => {
							const u = new URL(url ?? '', window.location.href)
							const href = u.pathname + u.search + u.hash
							originalPushState.call(history, unused, href)
						}

						// const appOrigin = new URL(baseUrl).origin
						// const isInIframe = window.self !== window.top

						// window.addEventListener(
						// 	'click',
						// 	(e) => {
						// 		const a = (e?.target as HTMLElement)?.closest('a')
						// 		if (!a || !a.href) return
						// 		const url = new URL(a.href, window.location.href)
						// 		if (
						// 			url.origin !== window.location.origin &&
						// 			url.origin != appOrigin
						// 		) {
						// 			try {
						// 				if (window.openai) {
						// 					// @ts-ignore
						// 					window.openai?.openExternal({ href: a.href })
						// 					e.preventDefault()
						// 				}
						// 			} catch {
						// 				try {
						// 					// @ts-ignore
						// 					if (window.oai) {
						// 						// @ts-ignore
						// 						window.oai.openExternal({ href: a.href })
						// 						e.preventDefault()
						// 					}
						// 				} catch {
						// 					console.warn(
						// 						'oai.openExternal failed, likely not in OpenAI client',
						// 					)
						// 				}
						// 				console.warn(
						// 					'openExternal failed, likely not in OpenAI client',
						// 				)
						// 			}
						// 		}
						// 	},
						// 	true,
						// )

						// if (isInIframe && window.location.origin !== appOrigin) {
						// 	const originalFetch = window.fetch

						// 	window.fetch = (input: URL | RequestInfo, init?: RequestInit) => {
						// 		let url: URL
						// 		if (typeof input === 'string' || input instanceof URL) {
						// 			url = new URL(input, window.location.href)
						// 		} else {
						// 			url = new URL(input.url, window.location.href)
						// 		}

						// 		if (url.origin === appOrigin) {
						// 			if (typeof input === 'string' || input instanceof URL) {
						// 				input = url.toString()
						// 			} else {
						// 				input = new Request(url.toString(), input)
						// 			}

						// 			return originalFetch.call(window, input, {
						// 				...init,
						// 				mode: 'cors',
						// 			})
						// 		}

						// 		if (url.origin === window.location.origin) {
						// 			const newUrl = new URL(baseUrl)
						// 			newUrl.pathname = url.pathname
						// 			newUrl.search = url.search
						// 			newUrl.hash = url.hash
						// 			url = newUrl

						// 			if (typeof input === 'string' || input instanceof URL) {
						// 				input = url.toString()
						// 			} else {
						// 				input = new Request(url.toString(), input)
						// 			}

						// 			return originalFetch.call(window, input, {
						// 				...init,
						// 				mode: 'cors',
						// 			})
						// 		}

						// 		return originalFetch.call(window, input, init)
						// 	}
						// }
					}).toString() +
					')()'}
			</script>
		</>
	)
}
