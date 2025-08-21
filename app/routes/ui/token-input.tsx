import { useEffect, useReducer, useRef } from 'react'
import {
	sendPrompt,
	useFormSubmissionCapability,
	useMcpUiInit,
} from '#app/utils/mcp.ts'
import { type Route } from './+types/token-input.tsx'

export async function loader({ request }: { request: Request }) {
	const url = new URL(request.url)
	const email = url.searchParams.get('email')

	return { email }
}

type TokenState =
	| { type: 'idle' }
	| { type: 'validating' }
	| { type: 'success' }
	| { type: 'error'; message: string }

type TokenAction =
	| { type: 'START_VALIDATION' }
	| { type: 'VALIDATION_SUCCESS' }
	| { type: 'VALIDATION_ERROR'; message: string }
	| { type: 'RESET' }

const tokenReducer = (state: TokenState, action: TokenAction): TokenState => {
	switch (action.type) {
		case 'START_VALIDATION':
			return { type: 'validating' }
		case 'VALIDATION_SUCCESS':
			return { type: 'success' }
		case 'VALIDATION_ERROR':
			return { type: 'error', message: action.message }
		case 'RESET':
			return { type: 'idle' }
		default:
			return state
	}
}

export default function TokenInput({ loaderData }: Route.ComponentProps) {
	const { email } = loaderData
	const [state, dispatch] = useReducer(tokenReducer, { type: 'idle' })
	const formRef = useRef<HTMLFormElement>(null)
	const abortControllerRef = useRef<AbortController | null>(null)
	const canUseOnSubmit = useFormSubmissionCapability()

	useMcpUiInit()

	// Create abort controller for cleanup
	useEffect(() => {
		abortControllerRef.current = new AbortController()

		return () => {
			abortControllerRef.current?.abort()
		}
	}, [])

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault()
		void validateToken()
	}

	async function handleButtonClick() {
		void validateToken()
	}

	async function validateToken() {
		const formData = new FormData(formRef.current!)
		const token = formData.get('token') as string

		if (!token.trim()) {
			dispatch({
				type: 'VALIDATION_ERROR',
				message: 'Please enter a validation token.',
			})
			return
		}

		if (!/^[0-9]{6}$/.test(token)) {
			dispatch({
				type: 'VALIDATION_ERROR',
				message: 'Please enter a valid 6-digit token.',
			})
			return
		}

		dispatch({ type: 'START_VALIDATION' })

		try {
			await sendPrompt(
				`Please validate this auth token with the epicme validate_token tool: ${token}`,
				abortControllerRef.current?.signal,
			)

			console.log('Token validation prompt sent to parent')
			dispatch({ type: 'VALIDATION_SUCCESS' })
		} catch (error) {
			console.error('Failed to send prompt:', error)
			dispatch({
				type: 'VALIDATION_ERROR',
				message: `Failed to send validation request: ${error instanceof Error ? error.message : 'Unknown error'}`,
			})
		}
	}

	function handleInputChange() {
		// Clear error state when user starts typing
		if (state.type === 'error') {
			dispatch({ type: 'RESET' })
		}
	}

	function handleKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
		// Allow Enter key to trigger validation even when form submission is blocked
		if (e.key === 'Enter' && !canUseOnSubmit) {
			e.preventDefault()
			void validateToken()
		}
	}

	// Success state
	if (state.type === 'success') {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<div className="bg-card w-full max-w-md rounded-xl p-8 shadow-lg">
					<div className="text-center">
						<div
							className="mb-5 text-5xl"
							role="img"
							aria-label="Success checkmark"
						>
							✅
						</div>
						<h1 className="text-primary mb-4 text-2xl font-bold">
							Token Submitted Successfully!
						</h1>
						<p className="text-muted-foreground leading-relaxed">
							Please wait for the agent to validate the token. If you have
							trouble, ask your agent to try authenticating again.
						</p>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<div className="bg-card mx-auto w-full max-w-md rounded-xl p-8 shadow-lg">
				<h1 className="text-foreground mb-5 text-center text-2xl font-bold">
					Enter Validation Token
				</h1>
				<p className="text-muted-foreground mb-6 text-center leading-relaxed">
					Please enter the validation token that was sent to{' '}
					<strong className="text-foreground">
						{email || 'your email address'}
					</strong>
					.
				</p>

				<form
					ref={formRef}
					onSubmit={handleSubmit}
					aria-label="Token validation form"
				>
					<div className="mb-6">
						<label
							htmlFor="token-input"
							className="text-foreground mb-2 block font-medium"
						>
							Validation Token:
						</label>
						<input
							autoFocus
							type="text"
							id="token-input"
							name="token"
							onChange={handleInputChange}
							onKeyUp={handleKeyUp}
							placeholder="Enter 6-digit token"
							maxLength={6}
							pattern="[0-9]{6}"
							required
							autoComplete="off"
							aria-describedby={
								state.type === 'error' ? 'token-error' : 'token-help'
							}
							aria-invalid={state.type === 'error'}
							aria-required={true}
							className={`w-full rounded-lg border-2 px-4 py-3 text-base transition-colors focus:outline-none ${
								state.type === 'error'
									? 'border-input-invalid focus:ring-input-invalid'
									: 'bg-input text-foreground focus:ring-primary'
							}`}
						/>
						<div
							id="token-help"
							className="text-muted-foreground mt-2 text-sm leading-relaxed"
						>
							Enter the 6-digit numeric token sent to your email
						</div>
					</div>

					<button
						type={canUseOnSubmit ? 'submit' : 'button'}
						id="submit-btn"
						onClick={canUseOnSubmit ? undefined : handleButtonClick}
						disabled={state.type === 'validating'}
						aria-describedby="submit-status"
						className={`focus:ring-offset-background w-full rounded-lg px-4 py-3 text-base font-medium transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none ${
							state.type === 'validating'
								? 'bg-muted text-muted-foreground cursor-not-allowed'
								: 'bg-primary text-primary-foreground focus:ring-primary cursor-pointer'
						}`}
					>
						{state.type === 'validating' ? 'Validating...' : 'Validate Token'}
					</button>
				</form>

				{state.type === 'error' && (
					<div
						id="token-error"
						className="border-input-invalid bg-muted text-foreground-destructive mt-4 rounded-lg border p-3 text-center font-medium"
						role="alert"
						aria-live="assertive"
						aria-atomic={true}
					>
						{state.message}
					</div>
				)}

				<div id="submit-status" className="sr-only" aria-live="polite">
					{state.type === 'validating' ? 'Validating token...' : ''}
				</div>
			</div>
		</div>
	)
}
