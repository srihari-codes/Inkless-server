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
const { User, Message } = require("./models"); // Add this line

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

// Inactive user cleanup function
const cleanupInactiveUsers = async () => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // Find users inactive for more than 10 minutes
    const inactiveUsers = await User.find({
      lastActive: { $lt: tenMinutesAgo },
    });

    for (const user of inactiveUsers) {
      // Delete messages
      await Message.deleteMany({
        $or: [{ senderId: user.id }, { recipientId: user.id }],
      });

      // Delete user
      await User.deleteOne({ id: user.id });

      console.log(`🧹 Cleaned up inactive user: ${user.id}`);
    }

    if (inactiveUsers.length > 0) {
      console.log(`🧹 Cleaned up ${inactiveUsers.length} inactive users`);
    }
  } catch (error) {
    console.error("Error in cleanup job:", error);
  }
};

// Run cleanup every 5 minutes
const cleanupInterval = setInterval(cleanupInactiveUsers, 5 * 60 * 1000);

// Add cleanup interval to graceful shutdown
process.on("SIGTERM", () => {
  console.log("🔄 SIGTERM received, shutting down gracefully...");
  clearInterval(cleanupInterval);
  server.close(() => {
    console.log("🔒 Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("🔄 SIGINT received, shutting down gracefully...");
  clearInterval(cleanupInterval);
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
