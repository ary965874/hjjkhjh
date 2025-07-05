# Telegram Chatbot Server

A robust, production-ready Telegram chatbot webhook server built with Express.js/Bun that never stops responding, even under error conditions.

## Features

✅ **Bulletproof Error Handling**: Comprehensive try/catch blocks with fallback messages
✅ **Circuit Breaker Pattern**: Automatic API failure detection and recovery
✅ **Exponential Backoff**: Smart retry logic for failed requests
✅ **Rate Limiting**: IP-based throttling to prevent abuse
✅ **Health Monitoring**: Real-time system health and metrics
✅ **Comprehensive Logging**: Timestamped logs for all activities
✅ **Memory Management**: Automatic cache cleanup and memory monitoring
✅ **Graceful Shutdown**: Clean server shutdown handling
✅ **Dashboard UI**: Built-in web interface for monitoring and testing
✅ **All Update Types**: Handles messages, callbacks, inline queries, etc.

## Quick Start

1. **Clone and Install**
   \`\`\`bash
   npm install
   # or
   bun install
   \`\`\`

2. **Configure Environment**
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your bot token
   \`\`\`

3. **Run the Server**
   \`\`\`bash
   # With Node.js
   npm run dev

   # With Bun
   bun run bun:dev
   \`\`\`

4. **Set Webhook**
   \`\`\`bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
        -H "Content-Type: application/json" \
        -d '{"url": "https://your-domain.com/webhook/your-secret-token"}'
   \`\`\`

## API Endpoints

- `GET /` - Dashboard UI
- `GET /status` - Health check endpoint
- `GET /api/stats` - Statistics JSON
- `POST /test-delivery` - Test message delivery
- `POST /webhook/:secret` - Telegram webhook endpoint

## Architecture

- **TelegramAPI**: Handles all Telegram API calls with retry logic
- **WebhookHandler**: Processes all update types with guaranteed responses
- **Logger**: Structured logging with timestamps
- **CacheManager**: In-memory storage with TTL support
- **HealthMonitor**: System health tracking
- **StatsManager**: Usage statistics and metrics

## Error Recovery

The bot automatically handles:
- Telegram API errors (429 rate limits, timeouts)
- Network failures (ECONNRESET, ETIMEDOUT)
- JSON parsing errors
- Memory issues
- Circuit breaker protection

## Deployment

### Docker
\`\`\`dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
\`\`\`

### Environment Variables
\`\`\`env
TELEGRAM_BOT_TOKEN=your_bot_token
WEBHOOK_SECRET=your_webhook_secret
PORT=3000
NODE_ENV=production
\`\`\`

## Monitoring

Access the dashboard at `http://localhost:3000` to:
- View system health and uptime
- Check message statistics
- Send test messages
- Monitor error rates

## License

MIT License - feel free to use in your projects!
