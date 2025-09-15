import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { ERROR_MESSAGES } from '../config/constants.js';

dotenv.config();

/**
 * JWT Utility Class
 * Handles JWT token generation, verification, and management
 */
class JWTUtils {
  constructor() {
    this.secret = process.env.JWT_SECRET;
    this.expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    
    if (!this.secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }

  /**
   * Generate JWT token for user
   * @param {Object} user - User object
   * @param {Object} options - Token options
   * @returns {string} JWT token
   */
  generateToken(user, options = {}) {
    try {
      const payload = {
        userId: user._id,
        email: user.email,
        role: user.role,
        designation: user.designation,
        isActive: user.isActive
      };

      const tokenOptions = {
        expiresIn: options.expiresIn || this.expiresIn,
        issuer: 'task-management-system',
        audience: 'task-management-users',
        subject: user._id.toString()
      };

      return jwt.sign(payload, this.secret, tokenOptions);
    } catch (error) {
      throw new Error(`Token generation failed: ${error.message}`);
    }
  }

  /**
   * Generate refresh token
   * @param {Object} user - User object
   * @returns {string} Refresh token
   */
  generateRefreshToken(user) {
    try {
      const payload = {
        userId: user._id,
        type: 'refresh'
      };

      const tokenOptions = {
        expiresIn: '30d', // Longer expiry for refresh tokens
        issuer: 'task-management-system',
        audience: 'task-management-users',
        subject: user._id.toString()
      };

      return jwt.sign(payload, this.secret, tokenOptions);
    } catch (error) {
      throw new Error(`Refresh token generation failed: ${error.message}`);
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded token payload
   */
  verifyToken(token) {
    try {
      const options = {
        issuer: 'task-management-system',
        audience: 'task-management-users'
      };

      return jwt.verify(token, this.secret, options);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      } else if (error.name === 'NotBeforeError') {
        throw new Error('Token not active yet');
      } else {
        throw new Error(`Token verification failed: ${error.message}`);
      }
    }
  }

  /**
   * Decode token without verification (for inspection)
   * @param {string} token - JWT token to decode
   * @returns {Object} Decoded token payload
   */
  decodeToken(token) {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      throw new Error(`Token decoding failed: ${error.message}`);
    }
  }

  /**
   * Check if token is expired
   * @param {string} token - JWT token to check
   * @returns {boolean} True if token is expired
   */
  isTokenExpired(token) {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.payload.exp) {
        return true;
      }
      
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.payload.exp < currentTime;
    } catch (error) {
      return true;
    }
  }

  /**
   * Extract token from authorization header
   * @param {string} authHeader - Authorization header value
   * @returns {string|null} Extracted token or null
   */
  extractTokenFromHeader(authHeader) {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Generate token pair (access + refresh)
   * @param {Object} user - User object
   * @returns {Object} Token pair
   */
  generateTokenPair(user) {
    return {
      accessToken: this.generateToken(user),
      refreshToken: this.generateRefreshToken(user),
      tokenType: 'Bearer',
      expiresIn: this.expiresIn
    };
  }

  /**
   * Blacklist token (for logout functionality)
   * Note: In production, you'd want to store blacklisted tokens in Redis or database
   * @param {string} token - Token to blacklist
   */
  blacklistToken(token) {
    // In a real implementation, you would store this in a blacklist
    // For now, we'll just log it
    console.log(`Token blacklisted: ${token.substring(0, 20)}...`);
  }

  /**
   * Check if token is blacklisted
   * @param {string} token - Token to check
   * @returns {boolean} True if token is blacklisted
   */
  isTokenBlacklisted(token) {
    // In a real implementation, you would check against stored blacklist
    // For now, return false (no blacklist storage implemented)
    return false;
  }

  /**
   * Get time until token expires
   * @param {string} token - JWT token
   * @returns {number} Time in seconds until expiration
   */
  getTimeUntilExpiration(token) {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.payload.exp) {
        return 0;
      }
      
      const currentTime = Math.floor(Date.now() / 1000);
      const timeUntilExp = decoded.payload.exp - currentTime;
      
      return timeUntilExp > 0 ? timeUntilExp : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Validate token payload structure
   * @param {Object} payload - Decoded token payload
   * @returns {boolean} True if payload is valid
   */
  validateTokenPayload(payload) {
    const requiredFields = ['userId', 'email', 'role'];
    
    for (const field of requiredFields) {
      if (!payload[field]) {
        return false;
      }
    }
    
    return true;
  }
}

// Create singleton instance
const jwtUtils = new JWTUtils();

export default jwtUtils;
