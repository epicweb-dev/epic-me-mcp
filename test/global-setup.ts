import { spawn } from 'child_process'

let epicMeMcp: ReturnType<typeof spawn> | null = null

export default async function globalSetup() {
	return new Promise((resolve, reject) => {
		epicMeMcp = spawn('npm', ['run', 'dev'], {
			stdio: ['ignore', 'pipe', 'pipe'],
		})

		if (!epicMeMcp) {
			reject(new Error('Failed to spawn EpicMeMCP process'))
			return
		}

		const serverProcess = epicMeMcp as NonNullable<typeof epicMeMcp>

		const timeout = setTimeout(() => {
			serverProcess.kill()
			reject(new Error('EpicMeMCP failed to start within 5 seconds'))
		}, 5000)

		serverProcess.stdout?.on('data', (data) => {
			const output = data.toString()
			const urlMatch = output.match(/Ready on (http:\/\/localhost:\d+)/)
			if (urlMatch) {
				const serverUrl = urlMatch[1]
				process.env.EPIC_ME_MCP_URL = serverUrl
				clearTimeout(timeout)
				resolve(() => {
					if (epicMeMcp) {
						epicMeMcp.kill()
						epicMeMcp = null
					}
				})
			}
			// Log all output if VERBOSE is set
			if (process.env.VERBOSE) {
				console.log('Server output:', output)
			}
		})

		serverProcess.stderr?.on('data', (data) => {
			console.error(String(data))
		})

		serverProcess.on('close', (code) => {
			clearTimeout(timeout)
			if (code !== 0) {
				reject(new Error('EpicMeMCP failed to start'))
			}
		})

		serverProcess.on('error', (error) => {
			clearTimeout(timeout)
			reject(error)
		})
	})
}
