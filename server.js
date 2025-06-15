require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDatabase = require("./config/database");
const apiRoutes = require("./routes/api");
const {
  generalRateLimit,
  corsOptions,
  securityMiddleware,
  requestLogger,
  errorHandler,
  notFoundHandler,
} = require("./middleware");

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Connect to database
connectDatabase();

// Security middleware
app.use(securityMiddleware);

// CORS configuration
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging
if (process.env.NODE_ENV !== "production") {
  app.use(requestLogger);
}

// Rate limiting
app.use(generalRateLimit);

// Trust proxy (important for rate limiting and IP detection)
app.set("trust proxy", 1);

// API routes
app.use("/api", apiRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Anonymous Messages API Server",
    version: "1.0.0",
    status: "running",
    endpoints: {
      generateId: "GET /api/generate-id",
      checkId: "GET /api/check-id/:id",
      createUser: "POST /api/users",
      sendMessage: "POST /api/messages/send",
      getMessages: "GET /api/messages/:recipientId", // Updated parameter name
      markAsRead: "PUT /api/messages/:userId/read",
      getUserStats: "GET /api/users/:userId/stats",
      health: "GET /api/health",
    },
    timestamp: new Date().toISOString(),
  });
});

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log(`
🚀 Anonymous Messages Server Started!
📍 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || "development"}
📡 API Base URL: http://localhost:${PORT}/api
⏰ Started at: ${new Date().toISOString()}

Available Endpoints:
  GET    /api/generate-id           - Generate random user ID
  GET    /api/check-id/:id          - Check if ID is available
  POST   /api/users                 - Create user with custom ID
  POST   /api/messages              - Send anonymous message
  GET    /api/messages/:userId      - Get messages for user
  PUT    /api/messages/:userId/read - Mark messages as read
  GET    /api/users/:userId/stats   - Get user statistics
  GET    /api/health                - Health check
  `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🔄 SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("🔒 Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("🔄 SIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("🔒 Server closed");
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("💥 Unhandled Rejection:", err);
  server.close(() => {
    process.exit(1);
  });
});

module.exports = app;
