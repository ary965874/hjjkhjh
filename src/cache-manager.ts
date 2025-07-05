interface CacheItem {
  value: any
  expiry: number
}

export class CacheManager {
  private cache: Map<string, CacheItem> = new Map()
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    // Clean up expired items every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup()
      },
      5 * 60 * 1000,
    )
  }

  set(key: string, value: any, ttlSeconds = 3600): void {
    const expiry = Date.now() + ttlSeconds * 1000
    this.cache.set(key, { value, expiry })
  }

  get(key: string): any {
    const item = this.cache.get(key)

    if (!item) {
      return null
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key)
      return null
    }

    return item.value
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  has(key: string): boolean {
    const item = this.cache.get(key)

    if (!item) {
      return false
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    this.cleanup()
    return this.cache.size
  }

  keys(): string[] {
    this.cleanup()
    return Array.from(this.cache.keys())
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key)
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.clear()
  }
}
