import { invariant } from '@epic-web/invariant'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { test, beforeAll, afterAll, expect } from 'vitest'
import { TestOAuthClientProvider } from '../test/oauth-utils.ts'

let client: Client

const MCP_URL = process.env.EPIC_ME_MCP_URL
invariant(
	MCP_URL,
	'EPIC_ME_MCP_URL is not set (should be set automatically by global-setup',
)

async function connect() {
	client = new Client({
		name: 'EpicMeMCP',
		version: '1.0.0',
	})
	const mcpEndpoint = new URL('/mcp', MCP_URL)
	// Create a new auth provider with the current server URL
	const serverAuthProvider = new TestOAuthClientProvider(mcpEndpoint.toString())

	await serverAuthProvider.completeAuthorization()

	// Create a new transport with auth headers
	const authHeaders = await serverAuthProvider.getAuthHeaders()
	const transport = new StreamableHTTPClientTransport(mcpEndpoint, {
		requestInit: {
			headers: authHeaders,
		},
	})
	await client.connect(transport)
	console.log(client.getServerCapabilities())
}

beforeAll(async () => {
	await connect()
})

afterAll(async () => {
	await client.transport?.close()
})

test('Tool Definition', async () => {
	const list = await client.listTools()
	const [firstTool] = list.tools
	invariant(firstTool, '🚨 No tools found')

	expect(firstTool).toEqual(
		expect.objectContaining({
			name: expect.stringMatching(/^add$/i),
			description: expect.stringMatching(/^add two numbers$/i),
			inputSchema: expect.objectContaining({
				type: 'object',
				properties: expect.objectContaining({
					firstNumber: expect.objectContaining({
						type: 'number',
						description: expect.stringMatching(/first/i),
					}),
				}),
			}),
		}),
	)
})

test('Tool Call', async () => {
	const result = await client.callTool({
		name: 'add',
		arguments: {
			firstNumber: 1,
			secondNumber: 2,
		},
	})

	expect(result).toEqual(
		expect.objectContaining({
			content: expect.arrayContaining([
				expect.objectContaining({
					type: 'text',
					text: expect.stringMatching(/3/),
				}),
			]),
		}),
	)
})
