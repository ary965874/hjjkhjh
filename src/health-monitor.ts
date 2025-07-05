export class HealthMonitor {
  private startTime: number
  private requestCount = 0

  constructor() {
    this.startTime = Date.now()
  }

  recordRequest(): void {
    this.requestCount++
  }

  getHealth(): {
    healthy: boolean
    uptime: number
    memory: {
      used: number
      total: number
      percentage: number
    }
    requests: number
  } {
    const uptime = Date.now() - this.startTime
    const memUsage = process.memoryUsage()
    const memUsed = memUsage.heapUsed
    const memTotal = memUsage.heapTotal
    const memPercentage = (memUsed / memTotal) * 100

    // Consider unhealthy if memory usage > 90% or uptime < 10 seconds
    const healthy = memPercentage < 90 && uptime > 10000

    return {
      healthy,
      uptime,
      memory: {
        used: memUsed,
        total: memTotal,
        percentage: memPercentage,
      },
      requests: this.requestCount,
    }
  }
}
