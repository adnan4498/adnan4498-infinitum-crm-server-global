import express from 'express';
import AuthController from '../controllers/authController.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';
import {
  validateUserRegistration,
  validateUserLogin,
  validateUserUpdate,
  validatePasswordChange,
  handleValidationErrors
} from '../utils/validation.js';

const router = express.Router();

/**
 * Authentication Routes
 * Base path: /api/auth
 */

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public (but admin role creation requires admin privileges)
 * @body    { firstName, lastName, email, password, designation, role?, phone?, department?, salary?, skills?, manager? }
 */
router.post('/register', 
  optionalAuthenticate, // Optional auth to check if admin is creating admin account
  validateUserRegistration,
  AuthController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 * @body    { email, password }
 */
router.post('/login', 
  validateUserLogin,
  AuthController.login
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and blacklist token
 * @access  Private
 * @headers Authorization: Bearer <token>
 */
router.post('/logout',
  authenticate,
  AuthController.logout
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 * @headers Authorization: Bearer <token>
 */
router.get('/me',
  authenticate,
  AuthController.getProfile
);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update current user profile
 * @access  Private
 * @headers Authorization: Bearer <token>
 * @body    { firstName?, lastName?, phone?, department?, skills?, ... }
 */
router.put('/profile',
  authenticate,
  validateUserUpdate,
  AuthController.updateProfile
);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 * @headers Authorization: Bearer <token>
 * @body    { currentPassword, newPassword, confirmPassword }
 */
router.put('/change-password',
  authenticate,
  validatePasswordChange,
  AuthController.changePassword
);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token using refresh token
 * @access  Public
 * @body    { refreshToken }
 */
router.post('/refresh-token',
  AuthController.refreshToken
);

/**
 * @route   GET /api/auth/dashboard-stats
 * @desc    Get user's dashboard statistics
 * @access  Private
 * @headers Authorization: Bearer <token>
 */
router.get('/dashboard-stats',
  authenticate,
  AuthController.getDashboardStats
);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify JWT token and return user data (legacy endpoint)
 * @access  Private
 * @headers Authorization: Bearer <token>
 */
router.get('/verify',
  authenticate,
  AuthController.verify
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email (placeholder)
 * @access  Public
 * @body    { email }
 */
router.post('/forgot-password', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Password reset feature not implemented yet',
    error: 'This feature will be available in a future update'
  });
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password using reset token (placeholder)
 * @access  Public
 * @body    { resetToken, newPassword }
 */
router.post('/reset-password', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Password reset feature not implemented yet',
    error: 'This feature will be available in a future update'
  });
});

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify email address (placeholder)
 * @access  Public
 * @body    { verificationToken }
 */
router.post('/verify-email', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Email verification feature not implemented yet',
    error: 'This feature will be available in a future update'
  });
});

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend email verification (placeholder)
 * @access  Private
 * @headers Authorization: Bearer <token>
 */
router.post('/resend-verification',
  authenticate,
  (req, res) => {
    res.status(501).json({
      success: false,
      message: 'Email verification feature not implemented yet',
      error: 'This feature will be available in a future update'
    });
  }
);

export default router;
