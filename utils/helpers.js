const crypto = require("crypto");
const { User } = require("../models");

/**
 * Generate a random 6-digit ID
 */
const generateRandomId = () => {
  // Generate a random number between 100000 and 999999
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate a unique 6-digit ID that doesn't exist in database
 */
const generateUniqueId = async (maxAttempts = 10) => {
  for (let i = 0; i < maxAttempts; i++) {
    const id = generateRandomId();

    // Check if ID already exists
    const existingUser = await User.findOne({ id });

    if (!existingUser) {
      return id;
    }
  }

  throw new Error("Unable to generate unique ID after maximum attempts");
};

/**
 * Validate 6-digit ID format
 */
const isValidId = (id) => {
  return /^\d{6}$/.test(id);
};

/**
 * Check if ID is available (doesn't exist in database)
 */
const isIdAvailable = async (id) => {
  if (!isValidId(id)) {
    return false;
  }

  const existingUser = await User.findOne({ id });
  return !existingUser;
};

/**
 * Create a simple fingerprint for anonymous tracking
 * This helps with basic spam prevention without identifying users
 */
const createFingerprint = (req) => {
  const components = [
    req.ip,
    req.headers["user-agent"] || "",
    req.headers["accept-language"] || "",
    // Add more headers as needed for fingerprinting
  ];

  return crypto.createHash("sha256").update(components.join("|")).digest("hex");
};

/**
 * Sanitize message content
 */
const sanitizeMessage = (content) => {
  if (typeof content !== "string") {
    return "";
  }

  return content
    .trim()
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .substring(0, 1000); // Limit length
};

/**
 * Format API response
 */
const formatResponse = (success, data = null, error = null, code = null) => {
  const response = { success };

  if (data !== null) {
    response.data = data;
  }

  if (error) {
    response.error = error;
  }

  if (code) {
    response.code = code;
  }

  return response;
};

/**
 * Parse pagination parameters
 */
const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Calculate pagination metadata
 */
const getPaginationMeta = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);

  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

/**
 * Validate message content
 */
const validateMessage = (content) => {
  if (!content || typeof content !== "string") {
    return { valid: false, error: "Message content is required" };
  }

  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "Message cannot be empty" };
  }

  if (trimmed.length > 1000) {
    return { valid: false, error: "Message too long (max 1000 characters)" };
  }

  // Basic spam detection (you can enhance this)
  const spamPatterns = [
    /(.)\1{10,}/, // Repeated characters
    /https?:\/\/[^\s]+/gi, // URLs (optional - you might want to allow them)
  ];

  for (const pattern of spamPatterns) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: "Message appears to be spam" };
    }
  }

  return { valid: true, content: trimmed };
};

/**
 * Generate API key (if needed for future authentication)
 */
const generateApiKey = () => {
  return crypto.randomBytes(32).toString("hex");
};

/**
 * Sleep function for rate limiting
 */
const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

module.exports = {
  generateRandomId,
  generateUniqueId,
  isValidId,
  isIdAvailable,
  createFingerprint,
  sanitizeMessage,
  formatResponse,
  parsePagination,
  getPaginationMeta,
  validateMessage,
  generateApiKey,
  sleep,
};
