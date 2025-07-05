import express from "express"
import { json } from "body-parser"
import rateLimit from "express-rate-limit"
import { TelegramAPI } from "./telegram-api"
import { Logger } from "./logger"
import { CacheManager } from "./cache-manager"
import { HealthMonitor } from "./health-monitor"
import { WebhookHandler } from "./webhook-handler"
import { StatsManager } from "./stats-manager"

const app = express()
const PORT = process.env.PORT || 3000
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ""
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "your-secret-token"

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN environment variable is required")
  process.exit(1)
}

// Initialize core services
const logger = new Logger()
const cacheManager = new CacheManager()
const healthMonitor = new HealthMonitor()
const telegramAPI = new TelegramAPI(TELEGRAM_BOT_TOKEN, logger)
const statsManager = new StatsManager(cacheManager)
const webhookHandler = new WebhookHandler(telegramAPI, logger, cacheManager, statsManager)

// Global error handlers
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { error: error.message, stack: error.stack })
})

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection", { reason, promise })
})

// Middleware
app.use(json({ limit: "10mb" }))

// IP-based rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per windowMs
  message: { error: "Too many requests from this IP" },
  standardHeaders: true,
  legacyHeaders: false,
})

app.use("/webhook", limiter)

// Health check middleware
app.use((req, res, next) => {
  healthMonitor.recordRequest()
  next()
})

// Routes
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Telegram Bot Server</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
            .healthy { background-color: #d4edda; color: #155724; }
            .unhealthy { background-color: #f8d7da; color: #721c24; }
            button { padding: 10px 20px; margin: 5px; cursor: pointer; }
            input, textarea { width: 100%; padding: 8px; margin: 5px 0; }
            .stats { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; }
        </style>
    </head>
    <body>
        <h1>Telegram Bot Server Dashboard</h1>
        <div id="status" class="status">Loading...</div>
        
        <h2>Test Message</h2>
        <div>
            <input type="text" id="chatId" placeholder="Chat ID" />
            <textarea id="message" placeholder="Test message" rows="3"></textarea>
            <button onclick="sendTestMessage()">Send Test Message</button>
        </div>
        
        <h2>System Stats</h2>
        <div id="stats" class="stats">Loading...</div>
        
        <script>
            async function loadStatus() {
                try {
                    const response = await fetch('/status');
                    const data = await response.json();
                    const statusDiv = document.getElementById('status');
                    statusDiv.className = 'status ' + (data.healthy ? 'healthy' : 'unhealthy');
                    statusDiv.innerHTML = \`
                        <strong>Status:</strong> \${data.healthy ? 'Healthy' : 'Unhealthy'}<br>
                        <strong>Uptime:</strong> \${Math.floor(data.uptime / 1000)}s<br>
                        <strong>Memory:</strong> \${(data.memory.used / 1024 / 1024).toFixed(2)}MB
                    \`;
                } catch (error) {
                    document.getElementById('status').innerHTML = 'Error loading status';
                }
            }
            
            async function loadStats() {
                try {
                    const response = await fetch('/api/stats');
                    const data = await response.json();
                    document.getElementById('stats').innerHTML = \`
                        <strong>Total Messages:</strong> \${data.totalMessages}<br>
                        <strong>Active Users:</strong> \${data.activeUsers}<br>
                        <strong>Errors (24h):</strong> \${data.errors24h}<br>
                        <strong>Last Activity:</strong> \${data.lastActivity || 'None'}
                    \`;
                } catch (error) {
                    document.getElementById('stats').innerHTML = 'Error loading stats';
                }
            }
            
            async function sendTestMessage() {
                const chatId = document.getElementById('chatId').value;
                const message = document.getElementById('message').value;
                
                if (!chatId || !message) {
                    alert('Please fill in both Chat ID and message');
                    return;
                }
                
                try {
                    const response = await fetch('/test-delivery', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chatId, message })
                    });
                    const result = await response.json();
                    alert(result.success ? 'Message sent successfully!' : 'Failed to send message: ' + result.error);
                } catch (error) {
                    alert('Error sending message: ' + error.message);
                }
            }
            
            // Load data on page load and refresh every 5 seconds
            loadStatus();
            loadStats();
            setInterval(() => {
                loadStatus();
                loadStats();
            }, 5000);
        </script>
    </body>
    </html>
  `)
})

app.get("/status", async (req, res) => {
  try {
    const health = healthMonitor.getHealth()
    const telegramStatus = await telegramAPI.checkHealth()

    res.json({
      healthy: health.healthy && telegramStatus,
      uptime: health.uptime,
      memory: health.memory,
      requests: health.requests,
      telegramAPI: telegramStatus,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error("Status check failed", { error: error.message })
    res.status(500).json({
      healthy: false,
      error: "Status check failed",
      timestamp: new Date().toISOString(),
    })
  }
})

app.get("/api/stats", (req, res) => {
  try {
    const stats = statsManager.getStats()
    res.json(stats)
  } catch (error) {
    logger.error("Stats retrieval failed", { error: error.message })
    res.status(500).json({ error: "Failed to retrieve stats" })
  }
})

app.post("/test-delivery", async (req, res) => {
  try {
    const { chatId, message } = req.body

    if (!chatId || !message) {
      return res.status(400).json({
        success: false,
        error: "chatId and message are required",
      })
    }

    const result = await telegramAPI.sendMessage(chatId, message)

    res.json({
      success: result.success,
      error: result.error,
      messageId: result.data?.message_id,
    })
  } catch (error) {
    logger.error("Test delivery failed", { error: error.message })
    res.status(500).json({
      success: false,
      error: "Internal server error",
    })
  }
})

app.post("/webhook/:secret", async (req, res) => {
  try {
    // Verify webhook secret
    if (req.params.secret !== WEBHOOK_SECRET) {
      logger.warn("Invalid webhook secret", { ip: req.ip })
      return res.status(401).json({ error: "Unauthorized" })
    }

    // Process webhook
    await webhookHandler.handleWebhook(req.body)

    // Always respond with 200 to acknowledge receipt
    res.status(200).json({ ok: true })
  } catch (error) {
    logger.error("Webhook processing failed", {
      error: error.message,
      body: req.body,
    })

    // Still respond with 200 to prevent Telegram from retrying
    res.status(200).json({ ok: true })
  }
})

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`)

  const server = app.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`)
    logger.info(`Webhook URL: http://localhost:${PORT}/webhook/${WEBHOOK_SECRET}`)
    logger.info(`Dashboard: http://localhost:${PORT}`)
  })

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
  process.on("SIGINT", () => gracefulShutdown("SIGINT"))

  return server
}

// Start server
const server = gracefulShutdown("START")

export default app
