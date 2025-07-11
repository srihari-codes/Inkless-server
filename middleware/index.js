const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

// Rate limiting configuration
const createRateLimit = (windowMs = 15 * 60 * 1000, max = 100) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: "Too many requests from this IP, please try again later.",
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/health" || req.path === "/wake",
  });
};

// Adjusted rate limits for free tier
const generalRateLimit = createRateLimit(15 * 60 * 1000, 50); // 50 requests per 15 minutes
const strictRateLimit = createRateLimit(5 * 60 * 1000, 5); // 5 requests per 5 minutes
const messageRateLimit = createRateLimit(10 * 60 * 1000, 30); // 30 messages per 10 minutes

// CORS configuration for development
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "http://localhost:3000", // dev frontend
      "https://tempsix-client.vercel.app", // deployed frontend — adjust this
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log("❌ Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  // Allow all origins in development
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Length", "X-Requested-With"],
  maxAge: 86400, // 24 hours
};

// Security middleware
const securityMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
];

// Validation middleware
const validateUserId = (req, res, next) => {
  const id = req.params.userId || req.params.recipientId || req.params.id;
  console.log("Validating ID:", id, "Params:", req.params);

  if (!id || !/^\d{6}$/.test(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID format. Must be exactly 6 digits.",
      code: "INVALID_ID_FORMAT",
    });
  }
  next();
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip || req.connection.remoteAddress;

  console.log(`[${timestamp}] ${method} ${url} - IP: ${ip}`);
  next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error("Error occurred:", err);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      error: "Validation failed",
      details: errors,
      code: "VALIDATION_ERROR",
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(409).json({
      error: "ID already exists",
      code: "DUPLICATE_ID",
    });
  }

  // CORS error
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      error: "CORS policy violation",
      code: "CORS_ERROR",
    });
  }

  // Default server error
  res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  });
};

// 404 handler
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: "Route not found",
    code: "NOT_FOUND",
    path: req.originalUrl,
  });
};

module.exports = {
  generalRateLimit,
  strictRateLimit,
  messageRateLimit,
  corsOptions,
  securityMiddleware,
  validateUserId,
  requestLogger,
  errorHandler,
  notFoundHandler,
};
