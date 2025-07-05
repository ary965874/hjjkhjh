import type { CacheManager } from "./cache-manager"

interface TelegramUpdate {
  update_id: number
  message?: any
  callback_query?: any
  inline_query?: any
  [key: string]: any
}

export class StatsManager {
  constructor(private cacheManager: CacheManager) {}

  recordUpdate(update: TelegramUpdate): void {
    // Increment total messages
    const totalMessages = this.cacheManager.get("stats:total_messages") || 0
    this.cacheManager.set("stats:total_messages", totalMessages + 1, 86400 * 7) // 7 days

    // Track user activity
    const userId = this.extractUserId(update)
    if (userId) {
      this.cacheManager.set(`stats:user:${userId}`, Date.now(), 86400) // 24 hours
    }

    // Update last activity
    this.cacheManager.set("stats:last_activity", new Date().toISOString(), 86400)

    // Track errors (if any)
    const errors24h = this.cacheManager.get("stats:errors_24h") || 0
    // This would be incremented in error handlers
  }

  recordError(): void {
    const errors24h = this.cacheManager.get("stats:errors_24h") || 0
    this.cacheManager.set("stats:errors_24h", errors24h + 1, 86400) // 24 hours
  }

  getStats(): {
    totalMessages: number
    activeUsers: number
    errors24h: number
    lastActivity: string | null
  } {
    const totalMessages = this.cacheManager.get("stats:total_messages") || 0
    const errors24h = this.cacheManager.get("stats:errors_24h") || 0
    const lastActivity = this.cacheManager.get("stats:last_activity")

    // Count active users (users who sent messages in last 24 hours)
    const userKeys = this.cacheManager.keys().filter((key) => key.startsWith("stats:user:"))
    const activeUsers = userKeys.length

    return {
      totalMessages,
      activeUsers,
      errors24h,
      lastActivity,
    }
  }

  private extractUserId(update: TelegramUpdate): string | null {
    if (update.message?.from?.id) return update.message.from.id.toString()
    if (update.callback_query?.from?.id) return update.callback_query.from.id.toString()
    if (update.inline_query?.from?.id) return update.inline_query.from.id.toString()
    return null
  }
}
