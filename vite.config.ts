import { cloudflare } from '@cloudflare/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import devtoolsJson from 'vite-plugin-devtools-json'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	base:
		process.env.NODE_ENV === 'production'
			? process.env.CLOUDFLARE_ENV === 'staging'
				? 'https://epic-me-mcp-staging.kentcdodds.workers.dev/'
				: 'https://epic-me-mcp.kentcdodds.workers.dev/'
			: undefined,
	define: { BUILD_TIMESTAMP: JSON.stringify(Date.now()) },
	server: {
		port: 8877,
	},
	plugins: [
		{
			name: 'strip-typegen-imports',
			enforce: 'pre',
			resolveId(id) {
				if (id.includes('+types/')) return id
			},
			load(id) {
				if (id.includes('+types/')) return 'export {}'
			},
		},
		cloudflare({
			viteEnvironment: { name: 'ssr' },
			experimental: { headersAndRedirectsDevModeSupport: true },
		}),
		tailwindcss(),
		reactRouter(),
		tsconfigPaths(),
		devtoolsJson(),
	],
})
