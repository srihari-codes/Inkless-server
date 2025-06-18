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
      customId: "POST /api/custom-id/:id", // Added this line
      sendMessage: "POST /api/messages/send",
      getMessages: "GET /api/messages/:recipientId",
      deleteUser: "DELETE /api/users/:userId",
      heartbeat: "PUT /api/users/:userId/heartbeat",
      userExists: "GET /api/users/:userId/exists",
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
  GET    /api/check-id/:userId      - Check if ID is available
  POST   /api/custom-id/:id         - Set custom user ID  
  POST   /api/messages/send         - Send anonymous message
  GET    /api/messages/:userId      - Get messages for user
  DELETE /api/users/:userId         - Delete user and messages
  PUT    /api/users/:userId/heartbeat - Update user heartbeat
  GET    /api/users/:userId/exists  - Check if user exists
  `);
});

// Inactive user cleanup function
const cleanupInactiveUsers = async () => {
  try {
    console.log("🧹 Starting cleanup job...");

    // First, handle soft-deleted users (marked for deletion)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const softDeletedUsers = await User.find({
      markedForDeletion: true,
      markedAt: { $lt: twoMinutesAgo },
    });

    for (const user of softDeletedUsers) {
      const messageDeleteResult = await Message.deleteMany({
        $or: [{ senderId: user.id }, { recipientId: user.id }],
      });

      await User.deleteOne({ id: user.id });

      console.log(
        `🗑️ Cleaned up soft-deleted user: ${user.id} (${messageDeleteResult.deletedCount} messages)`
      );
    }

    // Then handle truly inactive users (no heartbeat for 15+ minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const inactiveUsers = await User.find({
      lastActive: { $lt: fifteenMinutesAgo },
      markedForDeletion: { $ne: true }, // Don't double-process
    });

    // Mark inactive users for deletion first
    if (inactiveUsers.length > 0) {
      await User.updateMany(
        { id: { $in: inactiveUsers.map((user) => user.id) } },
        {
          markedForDeletion: true,
          markedAt: new Date(),
          deleteReason: "inactivity",
        }
      );

      console.log(
        `🏷️ Marked ${inactiveUsers.length} inactive users for deletion`
      );
    }

    // Log cleanup summary
    const totalProcessed = softDeletedUsers.length + inactiveUsers.length;
    if (totalProcessed > 0) {
      console.log(`🧹 Cleanup summary:
        - Deleted users: ${softDeletedUsers.length}
        - Marked for deletion: ${inactiveUsers.length}
        - Total processed: ${totalProcessed}
      `);
    } else {
      console.log("✨ No users needed cleanup");
    }
  } catch (error) {
    console.error("💥 Error in cleanup job:", error);
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
