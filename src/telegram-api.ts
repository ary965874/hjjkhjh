import type { Logger } from "./logger"

interface TelegramResponse {
  ok: boolean
  result?: any
  error_code?: number
  description?: string
}

interface APIResult {
  success: boolean
  data?: any
  error?: string
  retryAfter?: number
}

export class TelegramAPI {
  private baseURL: string
  private circuitBreaker: {
    failures: number
    lastFailure: number
    state: "closed" | "open" | "half-open"
  }

  constructor(
    private token: string,
    private logger: Logger,
  ) {
    this.baseURL = `https://api.telegram.org/bot${token}`
    this.circuitBreaker = {
      failures: 0,
      lastFailure: 0,
      state: "closed",
    }
  }

  async makeRequest(method: string, params: any = {}): Promise<APIResult> {
    // Check circuit breaker
    if (this.circuitBreaker.state === "open") {
      const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailure
      if (timeSinceLastFailure < 30000) {
        // 30 seconds
        return {
          success: false,
          error: "Circuit breaker is open",
        }
      } else {
        this.circuitBreaker.state = "half-open"
      }
    }

    const maxRetries = 3
    let lastError = ""

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = `${this.baseURL}/${method}`
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(10000), // 10 second timeout
        })

        const data: TelegramResponse = await response.json()

        if (data.ok) {
          // Reset circuit breaker on success
          this.circuitBreaker.failures = 0
          this.circuitBreaker.state = "closed"

          return {
            success: true,
            data: data.result,
          }
        } else {
          lastError = data.description || "Unknown API error"

          // Handle rate limiting
          if (data.error_code === 429) {
            const retryAfter = this.extractRetryAfter(data.description || "")
            this.logger.warn("Rate limited by Telegram API", {
              retryAfter,
              attempt,
              method,
            })

            if (attempt < maxRetries) {
              await this.sleep(retryAfter * 1000)
              continue
            }

            return {
              success: false,
              error: lastError,
              retryAfter,
            }
          }

          // Handle other API errors
          this.logger.error("Telegram API error", {
            method,
            error_code: data.error_code,
            description: data.description,
            attempt,
          })
        }
      } catch (error: any) {
        lastError = error.message

        this.logger.error("Request failed", {
          method,
          attempt,
          error: error.message,
          type: error.name,
        })

        // Handle specific network errors
        if (error.name === "AbortError") {
          lastError = "Request timeout"
        } else if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT") {
          lastError = "Connection error"
        }
      }

      // Exponential backoff
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        await this.sleep(delay)
      }
    }

    // Update circuit breaker on failure
    this.circuitBreaker.failures++
    this.circuitBreaker.lastFailure = Date.now()

    if (this.circuitBreaker.failures >= 5) {
      this.circuitBreaker.state = "open"
      this.logger.warn("Circuit breaker opened", {
        failures: this.circuitBreaker.failures,
      })
    }

    return {
      success: false,
      error: lastError,
    }
  }

  async sendMessage(chatId: string | number, text: string, options: any = {}): Promise<APIResult> {
    return this.makeRequest("sendMessage", {
      chat_id: chatId,
      text,
      ...options,
    })
  }

  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    options: any = {},
  ): Promise<APIResult> {
    return this.makeRequest("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options,
    })
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false): Promise<APIResult> {
    return this.makeRequest("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    })
  }

  async answerInlineQuery(inlineQueryId: string, results: any[], options: any = {}): Promise<APIResult> {
    return this.makeRequest("answerInlineQuery", {
      inline_query_id: inlineQueryId,
      results,
      ...options,
    })
  }

  async checkHealth(): Promise<boolean> {
    try {
      const result = await this.makeRequest("getMe")
      return result.success
    } catch (error) {
      return false
    }
  }

  private extractRetryAfter(description: string): number {
    const match = description.match(/retry after (\d+)/i)
    return match ? Number.parseInt(match[1]) : 1
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
