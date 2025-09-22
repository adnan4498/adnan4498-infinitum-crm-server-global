import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import authRouter from "./routes/authRoutes.js";
import employeeRouter from "./routes/employeeRoutes.js";
import taskRouter from "./routes/taskRoutes.js";
import notificationRouter from "./routes/notificationRoutes.js";
// import departmentRouter from './routes/department.js'
// import salaryRouter from './routes/salary.js'
// import leaveRouter from './routes/leave.js'
// import settingRouter from './routes/setting.js'
// import attendanceRouter from './routes/attendance.js'
// import dashboardRouter from './routes/dashboard.js'
import database from "./config/database.js";

database.connect();
const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors(
  //   {
  //   origin: ["https://infinitum-crm-client-global.vercel.app"], // Frontend origin
  //   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allowed methods
  //   allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
  //   credentials: true, // Allow cookies and credentials
  // }
)
);
app.use(compression());
app.use(mongoSanitize());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

// Logging
app.use(morgan("combined"));

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Static files
// app.use(express.static('public/uploads'))

// API routes
app.use("/api/auth", authRouter);
app.use("/api/employees", employeeRouter);
app.use("/api/tasks", taskRouter);
app.use("/api/notifications", notificationRouter);
// app.use('/api/department', departmentRouter)
// app.use('/api/salary', salaryRouter)
// app.use('/api/leave', leaveRouter)
// app.use('/api/setting', settingRouter)
// app.use('/api/attendance', attendanceRouter)
// app.use('/api/dashboard', dashboardRouter)

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Global error handler:", error);

  // Mongoose validation error
  if (error.name === "ValidationError") {
    const errors = Object.values(error.errors).map((err) => err.message);
    return res.status(400).json({
      success: false,
      message: "Validation Error",
      errors,
    });
  }

  // Mongoose duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    return res.status(409).json({
      success: false,
      message: "Duplicate field value",
      error: `${field} already exists`,
    });
  }

  // JWT errors
  if (error.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
      error: "Token is not valid",
    });
  }

  if (error.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expired",
      error: "Token has expired",
    });
  }

  // Default error
  res.status(error.status || 500).json({
    success: false,
    message: error.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  // console.log(
  //   `📱 Allowed Client URLs: http://localhost:3000, http://localhost:3001, http://localhost:3002, http://localhost:3003, ${
  //     process.env.CLIENT_URL || "none"
  //   }`
  // );
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});
