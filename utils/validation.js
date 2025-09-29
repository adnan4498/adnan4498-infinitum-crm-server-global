import { body, param, query, validationResult } from 'express-validator';
import {
  USER_ROLES,
  USER_DESIGNATIONS,
  TASK_STATUS,
  NOTIFICATION_TYPES,
  HTTP_STATUS,
  ERROR_MESSAGES,
  VALIDATION_RULES
} from '../config/constants.js';

/**
 * Custom validation result handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value
    }));

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: ERROR_MESSAGES.VALIDATION_ERROR,
      errors: errorMessages
    });
  }
  
  next();
};

/**
 * User Registration Validation
 */
export const validateUserRegistration = [
  body('firstName')
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name can only contain letters and spaces'),

  body('lastName')
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Last name can only contain letters and spaces'),

  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: VALIDATION_RULES.EMAIL_MAX_LENGTH })
    .withMessage(`Email cannot exceed ${VALIDATION_RULES.EMAIL_MAX_LENGTH} characters`),

  body('password')
    .isLength({ min: VALIDATION_RULES.PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} characters long`),

  body('role')
    .optional()
    .isIn(Object.values(USER_ROLES))
    .withMessage(`Role must be one of: ${Object.values(USER_ROLES).join(', ')}`),

  body('designation')
    .notEmpty()
    .withMessage('Designation is required')
    .isIn(Object.values(USER_DESIGNATIONS))
    .withMessage(`Designation must be one of: ${Object.values(USER_DESIGNATIONS).join(', ')}`),


  body('department')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Department name cannot exceed 100 characters'),

  body('salary')
    .optional()
    .isNumeric()
    .withMessage('Salary must be a number')
    .isFloat({ min: 0 })
    .withMessage('Salary cannot be negative'),

  handleValidationErrors
];

/**
 * User Login Validation
 */
export const validateUserLogin = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),

  handleValidationErrors
];

/**
 * User Update Validation
 */
export const validateUserUpdate = [
  body('firstName')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name can only contain letters and spaces'),

  body('lastName')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Last name can only contain letters and spaces'),


  body('designation')
    .optional()
    .isIn(Object.values(USER_DESIGNATIONS))
    .withMessage(`Designation must be one of: ${Object.values(USER_DESIGNATIONS).join(', ')}`),

  body('department')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Department name cannot exceed 100 characters'),

  body('salary')
    .optional()
    .isNumeric()
    .withMessage('Salary must be a number')
    .isFloat({ min: 0 })
    .withMessage('Salary cannot be negative'),

  body('skills')
    .optional()
    .isArray()
    .withMessage('Skills must be an array'),

  body('skills.*')
    .optional()
    .isString()
    .withMessage('Each skill must be a string'),

  handleValidationErrors
];

/**
 * Password Change Validation
 */
export const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),

  body('newPassword')
    .isLength({ min: VALIDATION_RULES.PASSWORD_MIN_LENGTH })
    .withMessage(`New password must be at least ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} characters long`),

  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    }),

  handleValidationErrors
];

/**
 * Task Creation Validation
 */
export const validateTaskCreation = [
  body('title')
    .notEmpty()
    .withMessage('Task title is required')
    .isLength({ max: VALIDATION_RULES.TASK_TITLE_MAX_LENGTH })
    .withMessage(`Task title cannot exceed ${VALIDATION_RULES.TASK_TITLE_MAX_LENGTH} characters`),

  body('description')
    .notEmpty()
    .withMessage('Task description is required')
    .isLength({ max: VALIDATION_RULES.TASK_DESCRIPTION_MAX_LENGTH })
    .withMessage(`Task description cannot exceed ${VALIDATION_RULES.TASK_DESCRIPTION_MAX_LENGTH} characters`),

  body('assignedTo')
    .notEmpty()
    .withMessage('Task must be assigned to a user')
    .isMongoId()
    .withMessage('Invalid user ID format'),


  body('dueDate')
    .notEmpty()
    .withMessage('Due date is required')
    .isISO8601()
    .withMessage('Due date must be a valid date')
    .custom(value => {
      if (new Date(value) <= new Date()) {
        throw new Error('Due date must be in the future');
      }
      return true;
    }),

  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date')
    .custom((value, { req }) => {
      if (value && req.body.dueDate && new Date(value) >= new Date(req.body.dueDate)) {
        throw new Error('Start date must be before due date');
      }
      return true;
    }),

  body('estimatedHours')
    .optional()
    .isNumeric()
    .withMessage('Estimated hours must be a number')
    .isFloat({ min: 0 })
    .withMessage('Estimated hours cannot be negative'),

  body('category')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Category cannot exceed 100 characters'),

  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),

  body('tags.*')
    .optional()
    .isString()
    .withMessage('Each tag must be a string'),

  handleValidationErrors
];

/**
 * Task Update Validation
 */
export const validateTaskUpdate = [
  body('title')
    .optional()
    .isLength({ max: VALIDATION_RULES.TASK_TITLE_MAX_LENGTH })
    .withMessage(`Task title cannot exceed ${VALIDATION_RULES.TASK_TITLE_MAX_LENGTH} characters`),

  body('description')
    .optional()
    .isLength({ max: VALIDATION_RULES.TASK_DESCRIPTION_MAX_LENGTH })
    .withMessage(`Task description cannot exceed ${VALIDATION_RULES.TASK_DESCRIPTION_MAX_LENGTH} characters`),

  body('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid user ID format'),

  body('status')
    .optional()
    .isIn(Object.values(TASK_STATUS))
    .withMessage(`Status must be one of: ${Object.values(TASK_STATUS).join(', ')}`),


  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),

  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date')
    .custom((value, { req }) => {
      if (value && req.body.dueDate && new Date(value) >= new Date(req.body.dueDate)) {
        throw new Error('Start date must be before due date');
      }
      return true;
    }),

  body('estimatedHours')
    .optional()
    .isNumeric()
    .withMessage('Estimated hours must be a number')
    .isFloat({ min: 0 })
    .withMessage('Estimated hours cannot be negative'),

  handleValidationErrors
];

/**
 * Comment Validation
 */
export const validateComment = [
  body('message')
    .notEmpty()
    .withMessage('Comment message is required')
    .isLength({ max: 1000 })
    .withMessage('Comment cannot exceed 1000 characters'),

  handleValidationErrors
];

/**
 * ObjectId Parameter Validation
 */
export const validateObjectId = (paramName = 'id') => [
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} format`),

  handleValidationErrors
];

/**
 * Query Parameters Validation
 */
export const validateQueryParams = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('sort')
    .optional()
    .isIn(['createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'dueDate', '-dueDate', 'priority', '-priority'])
    .withMessage('Invalid sort parameter'),

  query('status')
    .optional()
    .isIn(Object.values(TASK_STATUS))
    .withMessage(`Status must be one of: ${Object.values(TASK_STATUS).join(', ')}`),


  query('role')
    .optional()
    .isIn(Object.values(USER_ROLES))
    .withMessage(`Role must be one of: ${Object.values(USER_ROLES).join(', ')}`),

  handleValidationErrors
];

/**
 * Search Query Validation
 */
export const validateSearchQuery = [
  query('q')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),

  query('type')
    .optional()
    .isIn(['users', 'tasks', 'all'])
    .withMessage('Search type must be one of: users, tasks, all'),

  handleValidationErrors
];

/**
 * Date Range Validation
 */
export const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date')
    .custom((value, { req }) => {
      if (req.query.startDate && new Date(value) <= new Date(req.query.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),

  handleValidationErrors
];

/**
 * File Upload Validation
 */
export const validateFileUpload = [
  body('filename')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Filename cannot exceed 255 characters'),

  handleValidationErrors
];

/**
 * Notification Validation
 */
export const validateNotification = [
  body('recipientId')
    .notEmpty()
    .withMessage('Recipient is required')
    .isMongoId()
    .withMessage('Invalid recipient ID format'),

  body('type')
    .notEmpty()
    .withMessage('Notification type is required')
    .isIn(Object.values(NOTIFICATION_TYPES))
    .withMessage(`Type must be one of: ${Object.values(NOTIFICATION_TYPES).join(', ')}`),

  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 100 })
    .withMessage('Title cannot exceed 100 characters'),

  body('message')
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ max: 500 })
    .withMessage('Message cannot exceed 500 characters'),

  handleValidationErrors
];

/**
 * Custom validator for strong passwords
 */
export const isStrongPassword = (value) => {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
  return regex.test(value);
};

/**
 * Custom validator for work hours
 */
export const isValidWorkHours = (value) => {
  return value >= 0 && value <= 24;
};

/**
 * Sanitize input data
 * @param {Object} data - Data to sanitize
 * @returns {Object} Sanitized data
 */
export const sanitizeInput = (data) => {
  const sanitized = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      // Remove HTML tags and trim whitespace
      sanitized[key] = value.replace(/<[^>]*>/g, '').trim();
    } else if (Array.isArray(value)) {
      // Sanitize array elements
      sanitized[key] = value.map(item => 
        typeof item === 'string' ? item.replace(/<[^>]*>/g, '').trim() : item
      );
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Validate pagination parameters
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Object} Validated pagination parameters
 */
export const validatePagination = (page = 1, limit = 10) => {
  const validPage = Math.max(1, parseInt(page) || 1);
  const validLimit = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (validPage - 1) * validLimit;
  
  return {
    page: validPage,
    limit: validLimit,
    skip
  };
};

export default {
  handleValidationErrors,
  validateUserRegistration,
  validateUserLogin,
  validateUserUpdate,
  validatePasswordChange,
  validateTaskCreation,
  validateTaskUpdate,
  validateComment,
  validateObjectId,
  validateQueryParams,
  validateSearchQuery,
  validateDateRange,
  validateFileUpload,
  validateNotification,
  isStrongPassword,
  isValidWorkHours,
  sanitizeInput,
  validatePagination
};
