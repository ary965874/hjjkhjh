export class Logger {
  private formatTimestamp(): string {
    return new Date().toISOString()
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = this.formatTimestamp()
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : ""
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`
  }

  info(message: string, meta?: any): void {
    console.log(this.formatMessage("info", message, meta))
  }

  warn(message: string, meta?: any): void {
    console.warn(this.formatMessage("warn", message, meta))
  }

  error(message: string, meta?: any): void {
    console.error(this.formatMessage("error", message, meta))
  }

  debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV === "development") {
      console.debug(this.formatMessage("debug", message, meta))
    }
  }
}
