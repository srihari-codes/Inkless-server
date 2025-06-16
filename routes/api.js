const express = require("express");
const router = express.Router();
const { User, Message } = require("../models");
const {
  generateUniqueId,
  isIdAvailable,
  isValidId,
  createFingerprint,
  formatResponse,
  parsePagination,
  getPaginationMeta,
  validateMessage,
  sanitizeMessage,
} = require("../utils/helpers");
const {
  strictRateLimit,
  messageRateLimit,
  validateUserId,
} = require("../middleware");

/**
 * Generate a random unique 6-digit ID
 * GET /api/generate-id
 */
router.get("/generate-id", strictRateLimit, async (req, res) => {
  try {
    const id = await generateUniqueId();

    // Create user in database
    const user = new User({ id });
    await user.save();

    console.log(`✅ Generated new user ID: ${id}`);

    res.json(formatResponse(true, { id }));
  } catch (error) {
    console.error("Error generating ID:", error);

    if (error.message.includes("Unable to generate unique ID")) {
      return res
        .status(503)
        .json(
          formatResponse(
            false,
            null,
            "Service temporarily unavailable. Please try again.",
            "SERVICE_UNAVAILABLE"
          )
        );
    }

    res
      .status(500)
      .json(
        formatResponse(false, null, "Failed to generate ID", "GENERATION_ERROR")
      );
  }
});

/**
 * Check if a specific ID is available
 * GET /api/check-id/:id
 */
router.get("/check-id/:id", validateUserId, async (req, res) => {
  try {
    const { id } = req.params;
    const available = await isIdAvailable(id);

    res.json(formatResponse(true, { available, id }));
  } catch (error) {
    console.error("Error checking ID availability:", error);
    res
      .status(500)
      .json(
        formatResponse(
          false,
          null,
          "Failed to check ID availability",
          "CHECK_ERROR"
        )
      );
  }
});

/**
 * Create a user with custom ID
 * POST /api/users
 */
router.post("/users", async (req, res) => {
  try {
    const { id } = req.body;

    if (!id || !isValidId(id)) {
      return res
        .status(400)
        .json(
          formatResponse(
            false,
            null,
            "Invalid ID format. Must be exactly 6 digits.",
            "INVALID_ID"
          )
        );
    }

    // Check if ID is available
    const available = await isIdAvailable(id);
    if (!available) {
      return res
        .status(409)
        .json(formatResponse(false, null, "ID already taken", "ID_TAKEN"));
    }

    // Create user
    const user = new User({ id });
    await user.save();

    console.log(`✅ Created user with custom ID: ${id}`);

    res.status(201).json(
      formatResponse(true, {
        id: user.id,
        createdAt: user.createdAt,
      })
    );
  } catch (error) {
    console.error("Error creating user:", error);

    if (error.code === 11000) {
      return res
        .status(409)
        .json(formatResponse(false, null, "ID already taken", "ID_TAKEN"));
    }

    res
      .status(500)
      .json(
        formatResponse(false, null, "Failed to create user", "CREATE_ERROR")
      );
  }
});

/**
 * Send a message to a user
 * POST /api/messages/send
 */
router.post("/messages/send", messageRateLimit, async (req, res) => {
  try {
    const { senderId, recipientId, content, senderFingerprint } = req.body;

    // Validation
    if (!senderId || !recipientId || !content) {
      return res
        .status(400)
        .json(
          formatResponse(
            false,
            null,
            "Missing required fields: senderId, recipientId, and content are required",
            "INVALID_REQUEST"
          )
        );
    }

    // Validate ID format (6 digits)
    if (!isValidId(senderId) || !isValidId(recipientId)) {
      return res
        .status(400)
        .json(
          formatResponse(
            false,
            null,
            "Both senderId and recipientId must be exactly 6 digits",
            "INVALID_ID"
          )
        );
    }

    // Check if sender is trying to send to themselves
    if (senderId === recipientId) {
      return res
        .status(400)
        .json(
          formatResponse(
            false,
            null,
            "Cannot send message to yourself",
            "INVALID_RECIPIENT"
          )
        );
    }

    // Validate message content
    const messageValidation = validateMessage(content);
    if (!messageValidation.valid) {
      return res
        .status(400)
        .json(
          formatResponse(
            false,
            null,
            messageValidation.error,
            "INVALID_MESSAGE"
          )
        );
    }

    // Check if both users exist
    const [sender, recipient] = await Promise.all([
      User.findOne({ id: senderId }),
      User.findOne({ id: recipientId }),
    ]);

    if (!sender) {
      return res
        .status(404)
        .json(
          formatResponse(false, null, "Sender not found", "SENDER_NOT_FOUND")
        );
    }

    if (!recipient) {
      return res
        .status(404)
        .json(
          formatResponse(
            false,
            null,
            "Recipient not found",
            "RECIPIENT_NOT_FOUND"
          )
        );
    }

    // Create message
    const message = new Message({
      senderId,
      recipientId,
      content: messageValidation.content,
      senderFingerprint: senderFingerprint || createFingerprint(req),
    });

    await message.save();

    // Update recipient's last active time
    await User.findOneAndUpdate(
      { id: recipientId },
      { lastActive: new Date() }
    );

    console.log(`📨 Message sent from ${senderId} to ${recipientId}`);

    res.status(201).json(
      formatResponse(true, {
        id: message._id,
        timestamp: message.timestamp,
        success: "Message sent successfully",
      })
    );
  } catch (error) {
    console.error("Error sending message:", error);

    if (error.name === "ValidationError") {
      return res
        .status(400)
        .json(
          formatResponse(
            false,
            null,
            "Validation error: " + error.message,
            "VALIDATION_ERROR"
          )
        );
    }

    res
      .status(500)
      .json(
        formatResponse(false, null, "Failed to send message", "SEND_ERROR")
      );
  }
});

/**
 * Get messages for a specific recipient
 * GET /api/messages/:recipientId
 */
router.get("/messages/:recipientId", validateUserId, async (req, res) => {
  try {
    const { recipientId } = req.params;
    const { page = 1, limit = 20, unread } = req.query;

    // Check if recipient exists
    const recipient = await User.findOne({ id: recipientId });
    if (!recipient) {
      return res
        .status(404)
        .json(
          formatResponse(false, null, "Recipient not found", "USER_NOT_FOUND")
        );
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = { recipientId };
    if (unread === "true") {
      query.isRead = false;
    }

    // Get messages with pagination
    const [messages, totalMessages] = await Promise.all([
      Message.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("-senderFingerprint")
        .lean(),
      Message.countDocuments(query),
    ]);

    // Store message IDs for deletion
    const messageIds = messages.map((msg) => msg._id);

    // Update recipient's last active time
    await User.findOneAndUpdate(
      { id: recipientId },
      { lastActive: new Date() }
    );

    // Delete retrieved messages
    await Message.deleteMany({ _id: { $in: messageIds } });

    console.log(
      `📨 Retrieved and deleted ${messages.length} messages for user ${recipientId}`
    );

    // Format pagination metadata (adjusted for deleted messages)
    const remainingMessages = totalMessages - messages.length;
    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(remainingMessages / parseInt(limit)),
      totalMessages: remainingMessages,
      hasMore: skip + messages.length < totalMessages,
      limit: parseInt(limit),
    };

    res.json(
      formatResponse(true, {
        messages,
        pagination,
        unreadCount:
          unread !== "true"
            ? await Message.countDocuments({ recipientId, isRead: false })
            : undefined,
        deletedCount: messages.length,
      })
    );
  } catch (error) {
    console.error("Error fetching and deleting messages:", error);
    res
      .status(500)
      .json(
        formatResponse(
          false,
          null,
          "Failed to process messages",
          "PROCESS_ERROR"
        )
      );
  }
});

/**
 * Mark messages as read
 * PUT /api/messages/:userId/read
 */
router.put("/messages/:userId/read", validateUserId, async (req, res) => {
  try {
    const { userId } = req.params;
    const { messageIds } = req.body;

    // Check if user exists
    const user = await User.findOne({ id: userId });
    if (!user) {
      return res
        .status(404)
        .json(formatResponse(false, null, "User not found", "USER_NOT_FOUND"));
    }

    let updateQuery = { recipientId: userId };

    // If specific message IDs provided, only update those
    if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
      updateQuery._id = { $in: messageIds };
    }

    // Update messages to read
    const result = await Message.updateMany(updateQuery, { isRead: true });

    console.log(
      `📖 Marked ${result.modifiedCount} messages as read for user ${userId}`
    );

    res.json(
      formatResponse(true, {
        updated: result.modifiedCount,
        success: "Messages marked as read",
      })
    );
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res
      .status(500)
      .json(
        formatResponse(
          false,
          null,
          "Failed to mark messages as read",
          "UPDATE_ERROR"
        )
      );
  }
});

/**
 * Get user statistics
 * GET /api/users/:userId/stats
 */
router.get("/users/:userId/stats", validateUserId, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await User.findOne({ id: userId });
    if (!user) {
      return res
        .status(404)
        .json(formatResponse(false, null, "User not found", "USER_NOT_FOUND"));
    }

    // Get message statistics
    const [totalMessages, unreadMessages] = await Promise.all([
      Message.countDocuments({ recipientId: userId }),
      Message.countDocuments({ recipientId: userId, isRead: false }),
    ]);

    res.json(
      formatResponse(true, {
        userId,
        createdAt: user.createdAt,
        lastActive: user.lastActive,
        totalMessages,
        unreadMessages,
        readMessages: totalMessages - unreadMessages,
      })
    );
  } catch (error) {
    console.error("Error fetching user stats:", error);
    res
      .status(500)
      .json(
        formatResponse(
          false,
          null,
          "Failed to fetch user statistics",
          "STATS_ERROR"
        )
      );
  }
});

/**
 * Health check endpoint
 * GET /api/health
 */
router.get("/health", async (req, res) => {
  try {
    // Check database connection
    await User.findOne({}).limit(1);

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: "connected",
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: "Database connection failed",
    });
  }
});

/**
 * Delete a user and all their messages
 * DELETE /api/users/:userId
 */
router.delete("/users/:userId", validateUserId, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await User.findOne({ id: userId });
    if (!user) {
      // Return success even if user doesn't exist (idempotent cleanup)
      return res.json(
        formatResponse(true, {
          userId,
          deletedMessages: 0,
          message: "User already deleted or never existed",
        })
      );
    }

    // Delete all messages where user is sender or recipient
    const messageDeleteResult = await Message.deleteMany({
      $or: [{ senderId: userId }, { recipientId: userId }],
    });

    // Delete the user
    await User.deleteOne({ id: userId });

    console.log(
      `🗑️ Deleted user ${userId} and ${messageDeleteResult.deletedCount} associated messages`
    );

    res.json(
      formatResponse(true, {
        userId,
        deletedMessages: messageDeleteResult.deletedCount,
        message: "User and associated data deleted successfully",
      })
    );
  } catch (error) {
    console.error("Error deleting user:", error);

    // Always return success for cleanup operations to avoid blocking
    res.json(
      formatResponse(true, {
        message: "Cleanup completed with errors",
        error: error.message,
      })
    );
  }
});

/**
 * Update user's last active timestamp
 * PUT /api/users/:userId/heartbeat
 */
router.put("/users/:userId/heartbeat", validateUserId, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOneAndUpdate(
      { id: userId },
      { lastActive: new Date() },
      { new: true }
    );

    if (!user) {
      return res
        .status(404)
        .json(formatResponse(false, null, "User not found", "USER_NOT_FOUND"));
    }

    res.json(
      formatResponse(true, {
        userId,
        lastActive: user.lastActive,
      })
    );
  } catch (error) {
    console.error("Error updating heartbeat:", error);
    res
      .status(500)
      .json(
        formatResponse(
          false,
          null,
          "Failed to update heartbeat",
          "HEARTBEAT_ERROR"
        )
      );
  }
});

/**
 * Check if user still exists (for client validation)
 * GET /api/users/:userId/exists
 */
router.get("/users/:userId/exists", validateUserId, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ id: userId });

    res.json(
      formatResponse(true, {
        exists: !!user,
        userId,
      })
    );
  } catch (error) {
    console.error("Error checking user existence:", error);
    res
      .status(500)
      .json(
        formatResponse(
          false,
          null,
          "Failed to check user existence",
          "CHECK_ERROR"
        )
      );
  }
});

module.exports = router;
