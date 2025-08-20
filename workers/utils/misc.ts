export function withCors(
	handler: (
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	) => Promise<Response>,
) {
	return async (request: Request, env: Env, ctx: ExecutionContext) => {
		// Handle CORS preflight requests
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 200,
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
					'Access-Control-Allow-Headers':
						'Content-Type, Authorization, X-Requested-With',
					'Access-Control-Max-Age': '86400',
				},
			})
		}

		// Call the original handler
		const response = await handler(request, env, ctx)

		// Add CORS headers to the response
		const newHeaders = new Headers(response.headers)
		newHeaders.set('Access-Control-Allow-Origin', '*')
		newHeaders.set(
			'Access-Control-Allow-Methods',
			'GET, POST, PUT, DELETE, OPTIONS',
		)
		newHeaders.set(
			'Access-Control-Allow-Headers',
			'Content-Type, Authorization, X-Requested-With',
		)

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: newHeaders,
		})
	}
}
