const mongoose = require("mongoose");

// User Schema
const userSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{6}$/,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Message Schema
const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: String,
      required: true,
      match: /^\d{6}$/,
      index: true,
    },
    recipientId: {
      type: String,
      required: true,
      match: /^\d{6}$/,
      index: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 1000, // Limit message length
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Optional: Add sender tracking (anonymous but for potential moderation)
    senderFingerprint: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
userSchema.index({ id: 1 });
userSchema.index({ createdAt: -1 });

messageSchema.index({ recipientId: 1, timestamp: -1 });
messageSchema.index({ timestamp: -1 });
messageSchema.index({ recipientId: 1, isRead: 1 });
// Add new index for sender
messageSchema.index({ senderId: 1, timestamp: -1 });

// Models
const User = mongoose.model("User", userSchema);
const Message = mongoose.model("Message", messageSchema);

module.exports = {
  User,
  Message,
};
