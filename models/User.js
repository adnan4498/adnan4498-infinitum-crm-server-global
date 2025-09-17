import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { USER_ROLES, USER_DESIGNATIONS } from '../config/constants.js';

/**
 * User Schema
 * Handles authentication, roles, and employee information
 */
const userSchema = new mongoose.Schema({
  // Basic Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Please provide a valid email address'
    ]
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false // Don't include password in queries by default
  },

  // Profile Information
  phone: {
    type: String,
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number']
  },
  avatar: {
    type: String,
    default: null
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },

  // Employee Information
  role: {
    type: String,
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.EMPLOYEE,
    required: true
  },
  designation: {
    type: String,
    enum: Object.values(USER_DESIGNATIONS),
    required: [true, 'Designation is required']
  },
  employeeId: {
    type: String,
    unique: true,
    sparse: true // Allow null values but enforce uniqueness when present
  },
  department: {
    type: String,
    trim: true
  },
  hireDate: {
    type: Date,
    default: Date.now
  },
  salary: {
    type: Number,
    min: 0
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },

  // Skills and Experience
  skills: [{
    type: String,
    trim: true
  }],
  experience: {
    years: {
      type: Number,
      min: 0,
      max: 50
    },
    description: String
  },

  // Preferences
  timezone: {
    type: String,
    default: 'UTC'
  },
  language: {
    type: String,
    default: 'en'
  },
  notifications: {
    email: {
      type: Boolean,
      default: true
    },
    push: {
      type: Boolean,
      default: true
    },
    sms: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.__v;
      delete ret.loginAttempts;
      delete ret.lockUntil;
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Index for better query performance
// userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ designation: 1 });
userSchema.index({ department: 1 });
userSchema.index({ isActive: 1 });
// userSchema.index({ employeeId: 1 });

// Pre-save middleware for password hashing
userSchema.pre('save', async function(next) {
  // Only hash password if it's modified or new
  if (!this.isModified('password')) return next();

  try {
    // Hash password with salt rounds of 12
    const saltRounds = 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware for employee ID generation
userSchema.pre('save', async function(next) {
  if (this.isNew && !this.employeeId) {
    try {
      const year = new Date().getFullYear();
      const designation = this.designation.toUpperCase().substring(0, 3);
      
      // Find the last employee with similar pattern
      const lastEmployee = await this.constructor.findOne(
        { employeeId: new RegExp(`^${year}${designation}`) },
        {},
        { sort: { employeeId: -1 } }
      );

      let nextNumber = 1;
      if (lastEmployee && lastEmployee.employeeId) {
        const lastNumber = parseInt(lastEmployee.employeeId.slice(-4));
        nextNumber = lastNumber + 1;
      }

      this.employeeId = `${year}${designation}${nextNumber.toString().padStart(4, '0')}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Instance Methods

/**
 * Compare password with hashed password
 * @param {string} candidatePassword - Password to compare
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

/**
 * Check if user can perform action based on role
 * @param {string} action - Action to check
 * @param {string} targetRole - Target user role (optional)
 * @returns {boolean}
 */
userSchema.methods.canPerformAction = function(action, targetRole = null) {
  const permissions = {
    [USER_ROLES.ADMIN]: [
      'create_user', 'update_user', 'delete_user', 'view_user',
      'create_task', 'update_task', 'delete_task', 'view_task', 'assign_task',
      'view_reports', 'manage_roles', 'system_settings'
    ],
    [USER_ROLES.PROJECT_MANAGER]: [
      'view_user', 'update_user',
      'create_task', 'update_task', 'delete_task', 'view_task', 'assign_task',
      'view_reports'
    ],
    [USER_ROLES.EMPLOYEE]: [
      'view_user', 'update_own_profile',
      'view_own_tasks', 'update_task_status', 'start_task', 'complete_task'
    ]
  };

  return permissions[this.role]?.includes(action) || false;
};

/**
 * Update last login timestamp
 */
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  return this.save();
};

/**
 * Increment login attempts and lock account if necessary
 */
userSchema.methods.incrementLoginAttempts = function() {
  const maxAttempts = 5;
  const lockTime = 30 * 60 * 1000; // 30 minutes

  this.loginAttempts += 1;

  if (this.loginAttempts >= maxAttempts && !this.isLocked) {
    this.lockUntil = Date.now() + lockTime;
  }

  return this.save();
};

// Static Methods

/**
 * Find users by role
 * @param {string} role - User role
 * @returns {Promise<Array>}
 */
userSchema.statics.findByRole = function(role) {
  return this.find({ role, isActive: true });
};

/**
 * Find employees by designation
 * @param {string} designation - Employee designation
 * @returns {Promise<Array>}
 */
userSchema.statics.findByDesignation = function(designation) {
  return this.find({ designation, isActive: true });
};

/**
 * Search users by query
 * @param {string} query - Search query
 * @returns {Promise<Array>}
 */
userSchema.statics.searchUsers = function(query) {
  const searchRegex = new RegExp(query, 'i');
  return this.find({
    $or: [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { email: searchRegex },
      { employeeId: searchRegex }
    ],
    isActive: true
  });
};

const User = mongoose.model('User', userSchema);

export default User;
