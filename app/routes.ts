import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
	index('routes/index.tsx'),
	// chat gpt hosts your app on their own server and serves it at /index.html
	route('index.html', 'routes/chat-gpt-app.tsx'),

	route('authorize', 'routes/authorize.tsx'),
	route('ui/token-input', 'routes/ui/token-input.tsx'),
	route('ui/journal-viewer', 'routes/ui/journal-viewer.tsx'),
	route('ui/entry-viewer', 'routes/ui/entry-viewer.tsx'),
	route('/*', 'routes/catch-all.tsx'),
] satisfies RouteConfig
