import User from '../models/User.js';
import jwtUtils from '../utils/jwt.js';
import { validatePagination, sanitizeInput } from '../utils/validation.js';
import { 
  HTTP_STATUS, 
  ERROR_MESSAGES, 
  SUCCESS_MESSAGES, 
  USER_ROLES,
  USER_DESIGNATIONS 
} from '../config/constants.js';

/**
 * Authentication Controller
 * Handles user authentication, registration, and profile management
 */
class AuthController {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  static async register(req, res) {
    try {
      const sanitizedData = sanitizeInput(req.body);
      const {
        firstName,
        lastName,
        email,
        password,
        role = USER_ROLES.EMPLOYEE,
        designation,
        phone,
        department,
        salary,
        skills = [],
        manager
      } = sanitizedData;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          message: ERROR_MESSAGES.USER_ALREADY_EXISTS,
          error: 'A user with this email address already exists'
        });
      }

      // Allow anyone to create accounts during signup (no authentication required)
      // Admin restrictions only apply to authenticated users creating accounts through employee management
      // The role will be properly saved and used for permissions after login

      // Create new user
      const userData = {
        firstName,
        lastName,
        email,
        password,
        role,
        designation,
        phone,
        department,
        salary,
        skills,
        manager
      };

      const newUser = new User(userData);
      await newUser.save();

      // Generate tokens
      const tokenPair = jwtUtils.generateTokenPair(newUser);

      // Remove sensitive data from response
      const userResponse = newUser.toJSON();

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: SUCCESS_MESSAGES.USER_CREATED,
        data: {
          user: userResponse,
          tokens: tokenPair
        }
      });
    } catch (error) {
      console.error('Registration error:', error);

      if (error.code === 11000) {
        // Duplicate key error
        const field = Object.keys(error.keyPattern)[0];
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          message: ERROR_MESSAGES.USER_ALREADY_EXISTS,
          error: `A user with this ${field} already exists`
        });
      }

      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }));

        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          errors: validationErrors
        });
      }

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to create user account'
      });
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   */
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user by email and include password
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.INVALID_CREDENTIALS,
          error: 'Invalid email or password'
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: 'Your account has been deactivated. Please contact an administrator.'
        });
      }

      // Check if account is locked
      if (user.isLocked) {
        const lockTimeRemaining = Math.ceil((user.lockUntil - Date.now()) / (1000 * 60));
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: `Account is locked due to too many failed login attempts. Try again in ${lockTimeRemaining} minutes.`
        });
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        // Increment login attempts
        await user.incrementLoginAttempts();

        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.INVALID_CREDENTIALS,
          error: 'Invalid email or password'
        });
      }

      // Update last login and clear login attempts
      await user.updateLastLogin();

      // Generate tokens
      const tokenPair = jwtUtils.generateTokenPair(user);

      // Remove sensitive data from response
      const userResponse = user.toJSON();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
        data: {
          user: userResponse,
          tokens: tokenPair
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Login failed'
      });
    }
  }

  /**
   * Logout user
   * POST /api/auth/logout
   */
  static async logout(req, res) {
    try {
      // Blacklist the current token
      if (req.token) {
        jwtUtils.blacklistToken(req.token);
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.LOGOUT_SUCCESS,
        data: null
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Logout failed'
      });
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  static async getProfile(req, res) {
    try {
      const user = await User.findById(req.user._id)
        .populate('manager', 'firstName lastName email designation')
        .select('-password');

      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.USER_NOT_FOUND,
          error: 'User profile not found'
        });
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Profile retrieved successfully',
        data: { user }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to retrieve profile'
      });
    }
  }

  /**
   * Update user profile
   * PUT /api/auth/profile
   */
  static async updateProfile(req, res) {
    try {
      const userId = req.user._id;
      const sanitizedData = sanitizeInput(req.body);
      
      // Remove fields that shouldn't be updated through this endpoint
      const {
        password,
        role,
        employeeId,
        isActive,
        isEmailVerified,
        loginAttempts,
        lockUntil,
        ...allowedUpdates
      } = sanitizedData;

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { ...allowedUpdates, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).select('-password');

      if (!updatedUser) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.USER_NOT_FOUND,
          error: 'User not found'
        });
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.USER_UPDATED,
        data: { user: updatedUser }
      });
    } catch (error) {
      console.error('Update profile error:', error);

      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }));

        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          errors: validationErrors
        });
      }

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to update profile'
      });
    }
  }

  /**
   * Change user password
   * PUT /api/auth/change-password
   */
  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user._id;

      // Find user with password
      const user = await User.findById(userId).select('+password');
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.USER_NOT_FOUND,
          error: 'User not found'
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.INVALID_CREDENTIALS,
          error: 'Current password is incorrect'
        });
      }

      // Update password
      user.password = newPassword;
      await user.save();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Password changed successfully',
        data: null
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to change password'
      });
    }
  }

  /**
   * Refresh access token
   * POST /api/auth/refresh-token
   */
  static async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          error: 'Refresh token is required'
        });
      }

      // Verify refresh token
      let decoded;
      try {
        decoded = jwtUtils.verifyToken(refreshToken);
      } catch (error) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.INVALID_TOKEN,
          error: 'Invalid or expired refresh token'
        });
      }

      // Check if it's actually a refresh token
      if (decoded.type !== 'refresh') {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.INVALID_TOKEN,
          error: 'Invalid token type'
        });
      }

      // Find user
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.USER_NOT_FOUND,
          error: 'User not found or inactive'
        });
      }

      // Generate new tokens
      const tokenPair = jwtUtils.generateTokenPair(user);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Tokens refreshed successfully',
        data: { tokens: tokenPair }
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to refresh token'
      });
    }
  }

  /**
   * Get user's dashboard statistics
   * GET /api/auth/dashboard-stats
   */
  static async getDashboardStats(req, res) {
    try {
      const userId = req.user._id;
      const userRole = req.user.role;

      // Import Task model here to avoid circular dependency
      const { default: Task } = await import('../models/Task.js');
      const { default: Notification } = await import('../models/Notification.js');

      let stats = {};

      if (userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.PROJECT_MANAGER) {
        // Admin/PM dashboard stats
        const totalUsers = await User.countDocuments({ isActive: true });
        const totalTasks = await Task.countDocuments();
        const activeTasks = await Task.countDocuments({ 
          status: { $in: ['pending', 'in_progress'] } 
        });
        const overdueTasks = await Task.countDocuments({
          dueDate: { $lt: new Date() },
          status: { $nin: ['completed', 'cancelled'] }
        });

        stats = {
          totalUsers,
          totalTasks,
          activeTasks,
          overdueTasks,
          completedTasks: totalTasks - activeTasks
        };
      } else {
        // Employee dashboard stats
        const myTasks = await Task.countDocuments({ assignedTo: userId });
        const pendingTasks = await Task.countDocuments({ 
          assignedTo: userId, 
          status: 'pending' 
        });
        const inProgressTasks = await Task.countDocuments({ 
          assignedTo: userId, 
          status: 'in_progress' 
        });
        const completedTasks = await Task.countDocuments({ 
          assignedTo: userId, 
          status: 'completed' 
        });
        const overdueTasks = await Task.countDocuments({
          assignedTo: userId,
          dueDate: { $lt: new Date() },
          status: { $nin: ['completed', 'cancelled'] }
        });

        stats = {
          myTasks,
          pendingTasks,
          inProgressTasks,
          completedTasks,
          overdueTasks
        };
      }

      // Common stats for all users
      const unreadNotifications = await Notification.countDocuments({
        recipient: userId,
        status: 'unread'
      });

      stats.unreadNotifications = unreadNotifications;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Dashboard statistics retrieved successfully',
        data: { stats }
      });
    } catch (error) {
      console.error('Dashboard stats error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to retrieve dashboard statistics'
      });
    }
  }

  /**
   * Verify user account (legacy method for backward compatibility)
   * GET /api/auth/verify
   */
  static async verify(req, res) {
    return res.status(HTTP_STATUS.OK).json({ 
      success: true, 
      user: req.user 
    });
  }
}

export default AuthController;

// Export individual methods for backward compatibility
export const { login, verify, register, logout, getProfile, updateProfile, changePassword, refreshToken, getDashboardStats } = AuthController;
