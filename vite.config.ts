import { cloudflare } from '@cloudflare/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import devtoolsJson from 'vite-plugin-devtools-json'
import tsconfigPaths from 'vite-tsconfig-paths'

const buildVersion = Date.now()

export default defineConfig({
	base: 'https://epic-me-mcp-staging.kentcdodds.workers.dev/',
	define: {
		BUILD_VERSION: JSON.stringify(buildVersion),
	},
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
