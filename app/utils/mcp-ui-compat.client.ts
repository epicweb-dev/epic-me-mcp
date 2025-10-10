// thanks https://gist.github.com/liady/aa3a4095f39f859a5877d1bcd710476c
/* eslint-disable */
// @ts-nocheck

var __defProp = Object.defineProperty
var __defNormalProp = (obj, key, value) =>
	key in obj
		? __defProp(obj, key, {
				enumerable: true,
				configurable: true,
				writable: true,
				value,
			})
		: (obj[key] = value)
var __publicField = (obj, key, value) => {
	__defNormalProp(obj, typeof key !== 'symbol' ? key + '' : key, value)
	return value
}
// src/adapters/appssdk/adapter-runtime.ts
var MCPUIAppsSdkAdapter = class {
	constructor(config = {}) {
		__publicField(this, 'config')
		__publicField(this, 'pendingRequests', /* @__PURE__ */ new Map())
		__publicField(this, 'messageIdCounter', 0)
		__publicField(this, 'originalPostMessage', null)
		this.config = {
			logger: config.logger || console,
			hostOrigin: config.hostOrigin || window.location.origin,
			timeout: config.timeout || 3e4,
			intentHandling: config.intentHandling || 'prompt',
		}
	}
	/**
	 * Initialize the adapter and monkey-patch postMessage if Apps SDK is present
	 */
	install() {
		if (!window.openai) {
			this.config.logger.warn(
				'[MCPUI-Apps SDK Adapter] window.openai not detected. Adapter will not activate.',
			)
			return false
		}
		this.config.logger.log('[MCPUI-Apps SDK Adapter] Initializing adapter...')
		this.patchPostMessage()
		this.setupAppsSdkEventListeners()
		this.sendRenderData()
		this.config.logger.log(
			'[MCPUI-Apps SDK Adapter] Adapter initialized successfully',
		)
		return true
	}
	/**
	 * Clean up pending requests and restore original postMessage
	 */
	uninstall() {
		for (const request of this.pendingRequests.values()) {
			clearTimeout(request.timeoutId)
			request.reject(new Error('Adapter uninstalled'))
		}
		this.pendingRequests.clear()
		if (this.originalPostMessage) {
			try {
				window.parent.postMessage = this.originalPostMessage
				this.config.logger.log(
					'[MCPUI-Apps SDK Adapter] Restored original parent.postMessage',
				)
			} catch (error) {
				this.config.logger.error(
					'[MCPUI-Apps SDK Adapter] Failed to restore original postMessage:',
					error,
				)
			}
		}
		this.config.logger.log('[MCPUI-Apps SDK Adapter] Adapter uninstalled')
	}
	/**
	 * Monkey-patch parent.postMessage to intercept MCP-UI messages
	 * and forward non-MCP-UI messages to the original postMessage
	 */
	patchPostMessage() {
		this.originalPostMessage =
			window.parent?.postMessage?.bind(window.parent) || null
		if (!this.originalPostMessage) {
			this.config.logger.debug(
				'[MCPUI-Apps SDK Adapter] parent.postMessage does not exist, installing shim only',
			)
		} else {
			this.config.logger.debug(
				'[MCPUI-Apps SDK Adapter] Monkey-patching parent.postMessage to intercept MCP-UI messages',
			)
		}
		const postMessageInterceptor = (message, targetOrigin, transfer) => {
			if (this.isMCPUIMessage(message)) {
				this.config.logger.debug(
					'[MCPUI-Apps SDK Adapter] Intercepted MCP-UI message:',
					message.type,
				)
				this.handleMCPUIMessage(message)
			} else {
				if (this.originalPostMessage) {
					this.config.logger.debug(
						'[MCPUI-Apps SDK Adapter] Forwarding non-MCP-UI message to original postMessage',
					)
					this.originalPostMessage(message, targetOrigin, transfer)
				} else {
					this.config.logger.warn(
						'[MCPUI-Apps SDK Adapter] No original postMessage to forward to, ignoring message:',
						message,
					)
				}
			}
		}
		try {
			window.parent.postMessage = postMessageInterceptor
		} catch (error) {
			this.config.logger.error(
				'[MCPUI-Apps SDK Adapter] Failed to monkey-patch parent.postMessage:',
				error,
			)
		}
	}
	/**
	 * Check if a message is an MCP-UI protocol message
	 */
	isMCPUIMessage(message) {
		if (!message || typeof message !== 'object') {
			return false
		}
		const msg = message
		return (
			typeof msg.type === 'string' &&
			(msg.type.startsWith('ui-') ||
				['tool', 'prompt', 'intent', 'notify', 'link'].includes(msg.type))
		)
	}
	/**
	 * Handle incoming MCP-UI messages and translate to Apps SDK actions
	 */
	async handleMCPUIMessage(message) {
		this.config.logger.debug(
			'[MCPUI-Apps SDK Adapter] Received MCPUI message:',
			message.type,
		)
		try {
			switch (message.type) {
				case 'tool':
					await this.handleToolMessage(message)
					break
				case 'prompt':
					await this.handlePromptMessage(message)
					break
				case 'intent':
					await this.handleIntentMessage(message)
					break
				case 'notify':
					await this.handleNotifyMessage(message)
					break
				case 'link':
					await this.handleLinkMessage(message)
					break
				case 'ui-lifecycle-iframe-ready':
					this.sendRenderData()
					break
				case 'ui-request-render-data':
					this.sendRenderData(message.messageId)
					break
				case 'ui-size-change':
					this.handleSizeChange(message)
					break
				case 'ui-request-data':
					this.handleRequestData(message)
					break
				default:
					this.config.logger.warn(
						'[MCPUI-Apps SDK Adapter] Unknown message type:',
						message.type,
					)
			}
		} catch (error) {
			this.config.logger.error(
				'[MCPUI-Apps SDK Adapter] Error handling message:',
				error,
			)
			if (message.messageId) {
				this.sendErrorResponse(message.messageId, error)
			}
		}
	}
	/**
	 * Handle 'tool' message - call Apps SDK tool
	 */
	async handleToolMessage(message) {
		if (message.type !== 'tool') return
		const { toolName, params } = message.payload
		const messageId = message.messageId || this.generateMessageId()
		this.sendAcknowledgment(messageId)
		try {
			if (!window.openai?.callTool) {
				throw new Error('Tool calling is not supported in this environment')
			}
			const result = await this.withTimeout(
				window.openai.callTool(toolName, params),
				messageId,
			)
			this.sendSuccessResponse(messageId, result)
		} catch (error) {
			this.sendErrorResponse(messageId, error)
		}
	}
	/**
	 * Handle 'prompt' message - send followup turn
	 */
	async handlePromptMessage(message) {
		if (message.type !== 'prompt') return
		const prompt = message.payload.prompt
		const messageId = message.messageId || this.generateMessageId()
		this.sendAcknowledgment(messageId)
		try {
			if (!window.openai?.sendFollowUpMessage) {
				throw new Error('Followup turns are not supported in this environment')
			}
			await this.withTimeout(
				window.openai.sendFollowUpMessage({ prompt }),
				messageId,
			)
			this.sendSuccessResponse(messageId, { success: true })
		} catch (error) {
			this.sendErrorResponse(messageId, error)
		}
	}
	/**
	 * Handle 'intent' message - convert to prompt or ignore based on config
	 */
	async handleIntentMessage(message) {
		if (message.type !== 'intent') return
		const messageId = message.messageId || this.generateMessageId()
		this.sendAcknowledgment(messageId)
		if (this.config.intentHandling === 'ignore') {
			this.config.logger.log(
				'[MCPUI-Apps SDK Adapter] Intent ignored:',
				message.payload.intent,
			)
			this.sendSuccessResponse(messageId, { ignored: true })
			return
		}
		const { intent, params } = message.payload
		const prompt = `${intent}${params ? ': ' + JSON.stringify(params) : ''}`
		try {
			if (!window.openai?.sendFollowUpMessage) {
				throw new Error('Followup turns are not supported in this environment')
			}
			await this.withTimeout(
				window.openai.sendFollowUpMessage({ prompt }),
				messageId,
			)
			this.sendSuccessResponse(messageId, { success: true })
		} catch (error) {
			this.sendErrorResponse(messageId, error)
		}
	}
	/**
	 * Handle 'notify' message - log only
	 */
	async handleNotifyMessage(message) {
		if (message.type !== 'notify') return
		const messageId = message.messageId || this.generateMessageId()
		this.config.logger.log(
			'[MCPUI-Apps SDK Adapter] Notification:',
			message.payload.message,
		)
		this.sendAcknowledgment(messageId)
		this.sendSuccessResponse(messageId, { acknowledged: true })
	}
	/**
	 * Handle 'link' message - not supported in Apps SDK environments
	 */
	async handleLinkMessage(message) {
		if (message.type !== 'link') return
		const messageId = message.messageId || this.generateMessageId()
		this.sendAcknowledgment(messageId)
		this.sendErrorResponse(
			messageId,
			new Error('Navigation is not supported in Apps SDK environment'),
		)
	}
	/**
	 * Handle size change - no-op in Apps SDK environment
	 */
	handleSizeChange(message) {
		this.config.logger.debug(
			'[MCPUI-Apps SDK Adapter] Size change requested (no-op in Apps SDK):',
			message.payload,
		)
	}
	/**
	 * Handle generic data request
	 */
	handleRequestData(message) {
		const messageId = message.messageId || this.generateMessageId()
		this.sendAcknowledgment(messageId)
		this.sendErrorResponse(
			messageId,
			new Error('Generic data requests not yet implemented'),
		)
	}
	/**
	 * Setup listeners for Apps SDK events
	 */
	setupAppsSdkEventListeners() {
		window.addEventListener('openai:set_globals', () => {
			this.config.logger.debug('[MCPUI-Apps SDK Adapter] Globals updated')
			this.sendRenderData()
		})
	}
	/**
	 * Gather render data from Apps SDK and send to widget
	 */
	sendRenderData(requestMessageId) {
		if (!window.openai) return
		const renderData = {
			toolInput: window.openai.toolInput,
			toolOutput: window.openai.toolOutput,
			widgetState: window.openai.widgetState,
			locale: window.openai.locale || 'en-US',
			theme: window.openai.theme || 'light',
			displayMode: window.openai.displayMode || 'inline',
			maxHeight: window.openai.maxHeight,
		}
		this.dispatchMessageToIframe({
			type: 'ui-lifecycle-iframe-render-data',
			messageId: requestMessageId,
			payload: { renderData },
		})
	}
	/**
	 * Send acknowledgment for a message
	 */
	sendAcknowledgment(messageId) {
		this.dispatchMessageToIframe({
			type: 'ui-message-received',
			payload: { messageId },
		})
	}
	/**
	 * Send success response
	 */
	sendSuccessResponse(messageId, response) {
		this.dispatchMessageToIframe({
			type: 'ui-message-response',
			payload: { messageId, response },
		})
	}
	/**
	 * Send error response
	 */
	sendErrorResponse(messageId, error) {
		const errorObj =
			error instanceof Error
				? { message: error.message, name: error.name }
				: { message: String(error) }
		this.dispatchMessageToIframe({
			type: 'ui-message-response',
			payload: { messageId, error: errorObj },
		})
	}
	/**
	 * Dispatch a MessageEvent to the iframe (widget)
	 * Simulates messages that would normally come from the parent/host
	 */
	dispatchMessageToIframe(data) {
		const event = new MessageEvent('message', {
			data,
			origin: this.config.hostOrigin,
			source: null,
		})
		window.dispatchEvent(event)
	}
	/**
	 * Wrap a promise with timeout
	 */
	async withTimeout(promise, requestId) {
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				this.pendingRequests.delete(requestId)
				reject(new Error(`Request timed out after ${this.config.timeout}ms`))
			}, this.config.timeout)
			this.pendingRequests.set(requestId, {
				messageId: requestId,
				type: 'generic',
				resolve,
				reject,
				timeoutId,
			})
			promise
				.then((result) => {
					clearTimeout(timeoutId)
					this.pendingRequests.delete(requestId)
					resolve(result)
				})
				.catch((error) => {
					clearTimeout(timeoutId)
					this.pendingRequests.delete(requestId)
					reject(error)
				})
		})
	}
	/**
	 * Generate a unique message ID
	 */
	generateMessageId() {
		return `adapter-${Date.now()}-${++this.messageIdCounter}`
	}
}
var adapterInstance = null
function initAdapter(config) {
	if (adapterInstance) {
		console.warn('[MCPUI-Apps SDK Adapter] Adapter already initialized')
		return true
	}
	adapterInstance = new MCPUIAppsSdkAdapter(config)
	return adapterInstance.install()
}
function uninstallAdapter() {
	if (adapterInstance) {
		adapterInstance.uninstall()
		adapterInstance = null
	}
}
if (
	typeof window !== 'undefined' &&
	!window.MCP_APPSSDK_ADAPTER_NO_AUTO_INSTALL
) {
	initAdapter()
}
