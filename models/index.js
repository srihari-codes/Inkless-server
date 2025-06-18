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
    // Add soft deletion fields to User schema
    markedForDeletion: {
      type: Boolean,
      default: false,
      index: true, // Add index for faster queries
    },
    markedAt: { type: Date },
    deleteReason: { type: String },
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
      maxlength: 1000,
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
    senderFingerprint: {
      type: String,
      required: false,
    },
    // Remove markedForDeletion fields from Message schema since messages
    // are hard deleted immediately
  },
  {
    timestamps: true,
  }
);

// Indexes
userSchema.index({ id: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ markedForDeletion: 1, markedAt: 1 }); // Add index for cleanup queries

messageSchema.index({ recipientId: 1, timestamp: -1 });
messageSchema.index({ timestamp: -1 });
messageSchema.index({ recipientId: 1, isRead: 1 });
messageSchema.index({ senderId: 1, timestamp: -1 });

// Models
const User = mongoose.model("User", userSchema);
const Message = mongoose.model("Message", messageSchema);

module.exports = {
  User,
  Message,
};
