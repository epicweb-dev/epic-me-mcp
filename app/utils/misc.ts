import { useEffect, useId, useState } from 'react'

const timers = new Map<string, number>()
const controllers = new Map<string, AbortController>()

// this is complicated because of StrictMode 😡
export function useUnmountSignal() {
	const id = useId()
	let ctrl = controllers.get(id)
	if (!ctrl) {
		ctrl = new AbortController()
		controllers.set(id, ctrl)
	}

	useEffect(() => {
		// StrictMode re-mount cancels the pending fake-unmount abort
		const t = timers.get(id)
		if (t) {
			clearTimeout(t)
			timers.delete(id)
		}

		return () => {
			const timeout = setTimeout(() => {
				controllers.get(id)?.abort()
				controllers.delete(id)
				timers.delete(id)
			}, 0)
			timers.set(id, timeout as unknown as number)
		}
	}, [id])

	return ctrl.signal
}

export function getErrorMessage(error: unknown) {
	if (typeof error === 'string') return error
	if (
		error &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message
	}
	console.error('Unable to get error message for error', error)
	return 'Unknown Error'
}

function callAll<Args extends Array<unknown>>(
	...fns: Array<((...args: Args) => unknown) | undefined>
) {
	return (...args: Args) => fns.forEach((fn) => fn?.(...args))
}

/**
 * Use this hook with a button and it will make it so the first click sets a
 * `doubleCheck` state to true, and the second click will actually trigger the
 * `onClick` handler. This allows you to have a button that can be like a
 * "are you sure?" experience for the user before doing destructive operations.
 */
export function useDoubleCheck() {
	const [doubleCheck, setDoubleCheck] = useState(false)

	function getButtonProps(
		props?: React.ButtonHTMLAttributes<HTMLButtonElement>,
	) {
		const onBlur: React.ButtonHTMLAttributes<HTMLButtonElement>['onBlur'] =
			() => setDoubleCheck(false)

		const onClick: React.ButtonHTMLAttributes<HTMLButtonElement>['onClick'] =
			doubleCheck
				? undefined
				: (e) => {
						e.preventDefault()
						setDoubleCheck(true)
					}

		const onKeyUp: React.ButtonHTMLAttributes<HTMLButtonElement>['onKeyUp'] = (
			e,
		) => {
			if (e.key === 'Escape') {
				setDoubleCheck(false)
			}
		}

		return {
			...props,
			onBlur: callAll(onBlur, props?.onBlur),
			onClick: callAll(onClick, props?.onClick),
			onKeyUp: callAll(onKeyUp, props?.onKeyUp),
		}
	}

	return { doubleCheck, getButtonProps }
}
