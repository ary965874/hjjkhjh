import type { TelegramAPI } from "./telegram-api"
import type { Logger } from "./logger"
import type { CacheManager } from "./cache-manager"
import type { StatsManager } from "./stats-manager"

interface TelegramUpdate {
  update_id: number
  message?: any
  edited_message?: any
  channel_post?: any
  edited_channel_post?: any
  inline_query?: any
  chosen_inline_result?: any
  callback_query?: any
  shipping_query?: any
  pre_checkout_query?: any
  poll?: any
  poll_answer?: any
  my_chat_member?: any
  chat_member?: any
  chat_join_request?: any
}

export class WebhookHandler {
  private readonly FALLBACK_MESSAGE = "I'm sorry, I'm experiencing technical difficulties. Please try again later."

  constructor(
    private telegramAPI: TelegramAPI,
    private logger: Logger,
    private cacheManager: CacheManager,
    private statsManager: StatsManager,
  ) {}

  async handleWebhook(update: TelegramUpdate): Promise<void> {
    try {
      this.logger.info("Received webhook update", {
        updateId: update.update_id,
        type: this.getUpdateType(update),
      })

      // Track the update
      this.statsManager.recordUpdate(update)

      // Check for throttling
      const chatId = this.extractChatId(update)
      if (chatId && this.isThrottled(chatId)) {
        this.logger.warn("User throttled", { chatId })
        return
      }

      // Process different update types
      let handled = false

      if (update.message) {
        handled = await this.handleMessage(update.message)
      } else if (update.edited_message) {
        handled = await this.handleEditedMessage(update.edited_message)
      } else if (update.callback_query) {
        handled = await this.handleCallbackQuery(update.callback_query)
      } else if (update.inline_query) {
        handled = await this.handleInlineQuery(update.inline_query)
      } else if (update.channel_post) {
        handled = await this.handleChannelPost(update.channel_post)
      } else if (update.my_chat_member) {
        handled = await this.handleChatMemberUpdate(update.my_chat_member)
      }

      // If no specific handler processed the update, send a generic response
      if (!handled && chatId) {
        await this.sendFallbackMessage(
          chatId,
          "I received your message but I'm not sure how to respond to this type of content.",
        )
      }
    } catch (error: any) {
      this.logger.error("Webhook handling failed", {
        error: error.message,
        stack: error.stack,
        update,
      })

      // Always try to send a fallback message
      const chatId = this.extractChatId(update)
      if (chatId) {
        await this.sendFallbackMessage(chatId, this.FALLBACK_MESSAGE)
      }
    }
  }

  private async handleMessage(message: any): Promise<boolean> {
    try {
      const chatId = message.chat.id
      const userId = message.from?.id
      const text = message.text || ""

      this.logger.info("Processing message", {
        chatId,
        userId,
        text: text.substring(0, 100),
      })

      // Update user activity
      if (userId) {
        this.cacheManager.set(`user:${userId}:last_seen`, Date.now(), 86400)
      }

      // Simple command handling
      if (text.startsWith("/start")) {
        return await this.handleStartCommand(chatId)
      } else if (text.startsWith("/help")) {
        return await this.handleHelpCommand(chatId)
      } else if (text.startsWith("/status")) {
        return await this.handleStatusCommand(chatId)
      } else {
        return await this.handleTextMessage(chatId, text, message)
      }
    } catch (error: any) {
      this.logger.error("Message handling failed", { error: error.message })
      return false
    }
  }

  private async handleEditedMessage(message: any): Promise<boolean> {
    try {
      const chatId = message.chat.id
      const result = await this.telegramAPI.sendMessage(
        chatId,
        "I noticed you edited your message. I don't process edited messages, but feel free to send a new one!",
      )
      return result.success
    } catch (error: any) {
      this.logger.error("Edited message handling failed", { error: error.message })
      return false
    }
  }

  private async handleCallbackQuery(callbackQuery: any): Promise<boolean> {
    try {
      const chatId = callbackQuery.message?.chat?.id
      const data = callbackQuery.data

      // Always answer the callback query
      await this.telegramAPI.answerCallbackQuery(callbackQuery.id, `You clicked: ${data}`)

      if (chatId) {
        const result = await this.telegramAPI.sendMessage(chatId, `Button clicked: ${data}`)
        return result.success
      }

      return true
    } catch (error: any) {
      this.logger.error("Callback query handling failed", { error: error.message })
      return false
    }
  }

  private async handleInlineQuery(inlineQuery: any): Promise<boolean> {
    try {
      const results = [
        {
          type: "article",
          id: "1",
          title: "Echo",
          input_message_content: {
            message_text: `You searched for: ${inlineQuery.query}`,
          },
        },
      ]

      const result = await this.telegramAPI.answerInlineQuery(inlineQuery.id, results)
      return result.success
    } catch (error: any) {
      this.logger.error("Inline query handling failed", { error: error.message })
      return false
    }
  }

  private async handleChannelPost(post: any): Promise<boolean> {
    // Channel posts don't typically need responses
    this.logger.info("Channel post received", { chatId: post.chat.id })
    return true
  }

  private async handleChatMemberUpdate(update: any): Promise<boolean> {
    try {
      const chatId = update.chat.id
      const newStatus = update.new_chat_member.status

      if (newStatus === "member") {
        const result = await this.telegramAPI.sendMessage(
          chatId,
          "Thanks for adding me to this chat! Type /help to see what I can do.",
        )
        return result.success
      }

      return true
    } catch (error: any) {
      this.logger.error("Chat member update handling failed", { error: error.message })
      return false
    }
  }

  private async handleStartCommand(chatId: string | number): Promise<boolean> {
    const welcomeMessage = `
🤖 Welcome to the Telegram Bot!

I'm a robust bot that never stops responding. Here's what I can do:

/help - Show this help message
/status - Check bot status
/echo [text] - Echo your message back

I'm designed to handle errors gracefully and always respond to your messages!
    `.trim()

    const result = await this.telegramAPI.sendMessage(chatId, welcomeMessage)
    return result.success
  }

  private async handleHelpCommand(chatId: string | number): Promise<boolean> {
    const helpMessage = `
📚 Bot Commands:

/start - Welcome message
/help - Show this help
/status - Bot health status
/echo [text] - Echo your message

🔧 Features:
• Always responds to messages
• Handles errors gracefully
• Automatic retry with backoff
• Circuit breaker protection
• Rate limiting protection

Send me any message and I'll respond!
    `.trim()

    const result = await this.telegramAPI.sendMessage(chatId, helpMessage)
    return result.success
  }

  private async handleStatusCommand(chatId: string | number): Promise<boolean> {
    const stats = this.statsManager.getStats()
    const statusMessage = `
🟢 Bot Status: Online

📊 Statistics:
• Total Messages: ${stats.totalMessages}
• Active Users: ${stats.activeUsers}
• Uptime: ${Math.floor(process.uptime())}s
• Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB

✅ All systems operational!
    `.trim()

    const result = await this.telegramAPI.sendMessage(chatId, statusMessage)
    return result.success
  }

  private async handleTextMessage(chatId: string | number, text: string, message: any): Promise<boolean> {
    try {
      let response: string

      if (text.toLowerCase().startsWith("/echo ")) {
        response = text.substring(6)
      } else if (text.toLowerCase().includes("hello") || text.toLowerCase().includes("hi")) {
        response = `Hello ${message.from?.first_name || "there"}! 👋`
      } else if (text.toLowerCase().includes("how are you")) {
        response = "I'm doing great! Thanks for asking. How can I help you today?"
      } else if (text.toLowerCase().includes("time")) {
        response = `Current time: ${new Date().toLocaleString()}`
      } else {
        response = `I received your message: "${text}"\n\nI'm a simple bot, but I always respond! Try /help for more commands.`
      }

      const result = await this.telegramAPI.sendMessage(chatId, response)
      return result.success
    } catch (error: any) {
      this.logger.error("Text message handling failed", { error: error.message })
      return false
    }
  }

  private async sendFallbackMessage(chatId: string | number, message: string = this.FALLBACK_MESSAGE): Promise<void> {
    try {
      await this.telegramAPI.sendMessage(chatId, message)
    } catch (error: any) {
      this.logger.error("Fallback message failed", {
        chatId,
        error: error.message,
      })
    }
  }

  private extractChatId(update: TelegramUpdate): string | number | null {
    if (update.message) return update.message.chat.id
    if (update.edited_message) return update.edited_message.chat.id
    if (update.callback_query?.message) return update.callback_query.message.chat.id
    if (update.channel_post) return update.channel_post.chat.id
    if (update.my_chat_member) return update.my_chat_member.chat.id
    return null
  }

  private getUpdateType(update: TelegramUpdate): string {
    if (update.message) return "message"
    if (update.edited_message) return "edited_message"
    if (update.callback_query) return "callback_query"
    if (update.inline_query) return "inline_query"
    if (update.channel_post) return "channel_post"
    if (update.my_chat_member) return "my_chat_member"
    return "unknown"
  }

  private isThrottled(chatId: string | number): boolean {
    const key = `throttle:${chatId}`
    const count = this.cacheManager.get(key) || 0

    if (count >= 10) {
      // 10 messages per minute
      return true
    }

    this.cacheManager.set(key, count + 1, 60) // 1 minute TTL
    return false
  }
}
