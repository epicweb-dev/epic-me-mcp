import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
	index('routes/index.tsx'),
	route('authorize', 'routes/authorize.tsx'),
	route('ui/token-input', 'routes/ui/token-input.tsx'),
	route('ui/journal-viewer', 'routes/ui/journal-viewer.tsx'),
	route('/*', 'routes/catch-all.tsx'),
] satisfies RouteConfig
