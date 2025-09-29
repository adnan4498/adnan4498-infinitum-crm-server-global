import User from '../models/User.js';
import jwtUtils from '../utils/jwt.js';
import { HTTP_STATUS, ERROR_MESSAGES, USER_ROLES } from '../config/constants.js';

/**
 * Authentication middleware to verify JWT tokens
 */
export const authenticate = async (req, res, next) => {
  try {
    // Extract token from header
    const authHeader = req.header('Authorization');
    const token = jwtUtils.extractTokenFromHeader(authHeader);
    
    if (!token) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS,
        error: 'No token provided'
      });
    }

    // Check if token is blacklisted
    if (jwtUtils.isTokenBlacklisted(token)) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.INVALID_TOKEN,
        error: 'Token has been revoked'
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwtUtils.verifyToken(token);
    } catch (error) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.INVALID_TOKEN,
        error: error.message
      });
    }

    // Validate token payload structure
    if (!jwtUtils.validateTokenPayload(decoded)) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.INVALID_TOKEN,
        error: 'Invalid token payload'
      });
    }

    // Find user in database
    const user = await User.findById(decoded.userId).select('+password');
    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.USER_NOT_FOUND,
        error: 'User associated with token no longer exists'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
        error: 'User account is deactivated'
      });
    }

    // Check if user account is locked
    if (user.isLocked) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
        error: 'User account is locked'
      });
    }

    // Add user to request object
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: ERROR_MESSAGES.SERVER_ERROR,
      error: 'Authentication failed'
    });
  }
};

/**
 * Authorization middleware to check user roles
 * @param {...string} allowedRoles - Allowed roles for the route
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS,
          error: 'Authentication required'
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: `Required role: ${allowedRoles.join(' or ')}, your role: ${req.user.role}`
        });
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Authorization failed'
      });
    }
  };
};

/**
 * Check if user can perform specific action
 * @param {string} action - Action to check
 */
export const canPerformAction = (action) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS,
          error: 'Authentication required'
        });
      }

      if (!req.user.canPerformAction(action)) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: `You don't have permission to ${action}`
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Permission check failed'
      });
    }
  };
};

/**
 * Check if user is admin or project manager
 */
export const isAdminOrPM = authorize(USER_ROLES.ADMIN, USER_ROLES.PROJECT_MANAGER);

/**
 * Check if user can create tasks (Admin, PM role, or Employee with PM designation)
 */
export const canCreateTasks = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS,
        error: 'Authentication required'
      });
    }

    // Admin can always create tasks
    if (req.user.role === USER_ROLES.ADMIN) {
      return next();
    }

    // Project Manager role can create tasks
    if (req.user.role === USER_ROLES.PROJECT_MANAGER) {
      return next();
    }

    // Employee with project_manager designation can create tasks
    if (req.user.role === USER_ROLES.EMPLOYEE && req.user.designation === 'project_manager') {
      return next();
    }

    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
      error: 'You need Admin role, Project Manager role, or Employee with Project Manager designation to create tasks'
    });
  } catch (error) {
    console.error('Task creation permission error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: ERROR_MESSAGES.SERVER_ERROR,
      error: 'Permission check failed'
    });
  }
};

/**
 * Check if user can manage tasks (Admin, PM role, or Employee with PM designation)
 * Used for task deletion and other management operations
 */
export const canManageTasks = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS,
        error: 'Authentication required'
      });
    }

    // Admin can always manage tasks
    if (req.user.role === USER_ROLES.ADMIN) {
      return next();
    }

    // Project Manager role can manage tasks
    if (req.user.role === USER_ROLES.PROJECT_MANAGER) {
      return next();
    }

    // Employee with project_manager designation can manage tasks
    if (req.user.role === USER_ROLES.EMPLOYEE && req.user.designation === 'project_manager') {
      return next();
    }

    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
      error: `Required role: admin or project_manager, or employee with project_manager designation, your role: ${req.user.role}`
    });
  } catch (error) {
    console.error('Task management permission error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: ERROR_MESSAGES.SERVER_ERROR,
      error: 'Permission check failed'
    });
  }
};

/**
 * Check if user is admin only
 */
export const isAdmin = authorize(USER_ROLES.ADMIN);

/**
 * Check if user is employee (can be used to exclude admin/PM from certain routes)
 */
export const isEmployee = authorize(USER_ROLES.EMPLOYEE);

/**
 * Check if user owns the resource or has admin/PM privileges
 * Expects resource owner ID to be in req.params.userId or req.body.userId
 */
export const isOwnerOrAuthorized = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS,
        error: 'Authentication required'
      });
    }

    const resourceOwnerId = req.params.userId || req.body.userId || req.params.id;
    
    // Admin and PM can access any resource
    if (req.user.role === USER_ROLES.ADMIN || req.user.role === USER_ROLES.PROJECT_MANAGER) {
      return next();
    }

    // User can only access their own resources
    if (req.user._id.toString() !== resourceOwnerId) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
        error: 'You can only access your own resources'
      });
    }

    next();
  } catch (error) {
    console.error('Ownership check error:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: ERROR_MESSAGES.SERVER_ERROR,
      error: 'Ownership check failed'
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 * Useful for routes that work differently for authenticated vs unauthenticated users
 */
export const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    const token = jwtUtils.extractTokenFromHeader(authHeader);
    
    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const decoded = jwtUtils.verifyToken(token);
      
      if (jwtUtils.validateTokenPayload(decoded)) {
        const user = await User.findById(decoded.userId);
        if (user && user.isActive && !user.isLocked) {
          req.user = user;
          req.token = token;
        } else {
          req.user = null;
        }
      } else {
        req.user = null;
      }
    } catch (error) {
      req.user = null;
    }
    
    next();
  } catch (error) {
    console.error('Optional authentication error:', error);
    req.user = null;
    next();
  }
};

/**
 * Rate limiting by user ID
 * Prevents abuse by limiting requests per user
 */
export const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();
  
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }
    
    const userId = req.user._id.toString();
    const now = Date.now();
    
    if (!userRequests.has(userId)) {
      userRequests.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const userLimit = userRequests.get(userId);
    
    if (now > userLimit.resetTime) {
      userLimit.count = 1;
      userLimit.resetTime = now + windowMs;
      return next();
    }
    
    if (userLimit.count >= maxRequests) {
      return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
        success: false,
        message: 'Too many requests from this user',
        error: `Rate limit exceeded. Try again in ${Math.ceil((userLimit.resetTime - now) / 1000)} seconds`
      });
    }
    
    userLimit.count++;
    next();
  };
};

/**
 * Check if user has specific designation
 * @param {...string} allowedDesignations - Allowed designations
 */
export const hasDesignation = (...allowedDesignations) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.UNAUTHORIZED_ACCESS,
          error: 'Authentication required'
        });
      }

      if (!allowedDesignations.includes(req.user.designation)) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: `Required designation: ${allowedDesignations.join(' or ')}`
        });
      }

      next();
    } catch (error) {
      console.error('Designation check error:', error);
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Designation check failed'
      });
    }
  };
};

export default {
  authenticate,
  authorize,
  canPerformAction,
  isAdminOrPM,
  canCreateTasks,
  canManageTasks,
  isAdmin,
  isEmployee,
  isOwnerOrAuthorized,
  optionalAuthenticate,
  userRateLimit,
  hasDesignation
};
