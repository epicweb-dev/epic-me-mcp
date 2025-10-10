import { type Config } from '@react-router/dev/config'

export default {
	ssr: true,
	routeDiscovery: { mode: 'initial' },
	future: {
		unstable_viteEnvironmentApi: true,
	},
} satisfies Config
