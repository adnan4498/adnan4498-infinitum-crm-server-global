import mongoose from 'mongoose';
import { TASK_STATUS } from '../config/constants.js';

/**
 * Task Schema
 * Handles task creation, assignment, and time tracking
 */
const taskSchema = new mongoose.Schema({
  // Basic Task Information
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true,
    maxlength: [200, 'Task title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Task description is required'],
    trim: true,
    maxlength: [2000, 'Task description cannot exceed 2000 characters']
  },
  
  // Task Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Task must be assigned to a user']
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Task must have an assigner']
  },
  
  // Task Properties
  status: {
    type: String,
    enum: Object.values(TASK_STATUS),
    default: TASK_STATUS.PENDING,
    required: true
  },
  
  // Dates and Deadlines
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },
  startDate: {
    type: Date,
    default: null
  },
  completedDate: {
    type: Date,
    default: null
  },
  estimatedHours: {
    type: Number,
    min: 0,
    default: null
  },
  
  // Time Tracking
  timeTracking: {
    totalTimeSpent: {
      type: Number, // in milliseconds
      default: 0
    },
    sessions: [{
      startTime: {
        type: Date,
        required: true
      },
      endTime: {
        type: Date,
        default: null
      },
      duration: {
        type: Number, // in milliseconds
        default: 0
      },
      notes: {
        type: String,
        trim: true
      }
    }],
    isActive: {
      type: Boolean,
      default: false
    },
    currentSessionStart: {
      type: Date,
      default: null
    }
  },
  
  // Task Metadata
  category: {
    type: String,
    trim: true,
    default: 'general'
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    path: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Comments and Updates
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, 'Comment cannot exceed 1000 characters']
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Status History
  statusHistory: [{
    status: {
      type: String,
      enum: Object.values(TASK_STATUS),
      required: true
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    reason: {
      type: String,
      trim: true
    }
  }],
  
  // Additional Properties
  isRecurring: {
    type: Boolean,
    default: false
  },
  parentTask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  },
  subtasks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  
  // Collaboration
  watchers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Custom Fields (for extensibility)
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

// Virtuals

// Check if task is overdue
taskSchema.virtual('isOverdue').get(function() {
  if (this.status === TASK_STATUS.COMPLETED || this.status === TASK_STATUS.CANCELLED) {
    return false;
  }
  return new Date() > this.dueDate;
});

// Get total time spent in hours
taskSchema.virtual('totalHoursSpent').get(function() {
  return Math.round((this.timeTracking.totalTimeSpent / (1000 * 60 * 60)) * 100) / 100;
});

// Get days until due date
taskSchema.virtual('daysUntilDue').get(function() {
  const now = new Date();
  const due = new Date(this.dueDate);
  const diffTime = due - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Check if task is currently being tracked
taskSchema.virtual('isBeingTracked').get(function() {
  return this.timeTracking.isActive && this.timeTracking.currentSessionStart;
});

// Indexes for better query performance
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ assignedBy: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ createdAt: -1 });
taskSchema.index({ 'timeTracking.isActive': 1 });
taskSchema.index({ category: 1 });
taskSchema.index({ tags: 1 });

// Pre-save middleware to update status history
taskSchema.pre('save', function(next) {
  if (this.isModified('status') && !this.isNew) {
    this.statusHistory.push({
      status: this.status,
      changedBy: this.modifiedBy || this.assignedBy,
      changedAt: new Date(),
      reason: this.statusChangeReason || 'Status updated'
    });
    
    // Update completion date
    if (this.status === TASK_STATUS.COMPLETED) {
      this.completedDate = new Date();
      // Stop time tracking if active
      if (this.timeTracking.isActive) {
        this.stopTimeTracking();
      }
    }
    
    // Update start date
    if (this.status === TASK_STATUS.IN_PROGRESS && !this.startDate) {
      this.startDate = new Date();
    }
  }
  next();
});

// Pre-save middleware to handle overdue tasks
taskSchema.pre('save', function(next) {
  if (this.dueDate && new Date() > this.dueDate && 
      this.status !== TASK_STATUS.COMPLETED && 
      this.status !== TASK_STATUS.CANCELLED &&
      this.status !== TASK_STATUS.OVERDUE) {
    this.status = TASK_STATUS.OVERDUE;
  }
  next();
});

// Instance Methods

/**
 * Start time tracking for the task
 * @returns {Promise<Task>}
 */
taskSchema.methods.startTimeTracking = async function() {
  if (this.timeTracking.isActive) {
    throw new Error('Time tracking is already active for this task');
  }
  
  this.timeTracking.isActive = true;
  this.timeTracking.currentSessionStart = new Date();
  
  // Update status to in progress if it's pending
  if (this.status === TASK_STATUS.PENDING) {
    this.status = TASK_STATUS.IN_PROGRESS;
  }
  
  return await this.save();
};

/**
 * Stop time tracking for the task
 * @param {string} notes - Optional notes for the session
 * @returns {Promise<Task>}
 */
taskSchema.methods.stopTimeTracking = async function(notes = '') {
  if (!this.timeTracking.isActive) {
    throw new Error('No active time tracking session for this task');
  }
  
  const endTime = new Date();
  const startTime = this.timeTracking.currentSessionStart;
  const duration = endTime - startTime;
  
  // Add session to history
  this.timeTracking.sessions.push({
    startTime,
    endTime,
    duration,
    notes
  });
  
  // Update total time
  this.timeTracking.totalTimeSpent += duration;
  
  // Reset active tracking
  this.timeTracking.isActive = false;
  this.timeTracking.currentSessionStart = null;
  
  return await this.save();
};

/**
 * Add a comment to the task
 * @param {ObjectId} userId - User adding the comment
 * @param {string} message - Comment message
 * @returns {Promise<Task>}
 */
taskSchema.methods.addComment = async function(userId, message) {
  this.comments.push({
    user: userId,
    message,
    timestamp: new Date()
  });
  
  return await this.save();
};

/**
 * Mark task as completed
 * @param {ObjectId} userId - User completing the task
 * @returns {Promise<Task>}
 */
taskSchema.methods.markAsCompleted = async function(userId) {
  this.status = TASK_STATUS.COMPLETED;
  this.completedDate = new Date();
  this.modifiedBy = userId;
  
  // Stop time tracking if active
  if (this.timeTracking.isActive) {
    await this.stopTimeTracking('Task completed');
  }
  
  return await this.save();
};

/**
 * Assign task to a different user
 * @param {ObjectId} newAssigneeId - New assignee user ID
 * @param {ObjectId} assignerId - User making the assignment
 * @returns {Promise<Task>}
 */
taskSchema.methods.reassign = async function(newAssigneeId, assignerId) {
  this.assignedTo = newAssigneeId;
  this.assignedBy = assignerId;
  this.modifiedBy = assignerId;
  
  return await this.save();
};

/**
 * Add a watcher to the task
 * @param {ObjectId} userId - User ID to add as watcher
 * @returns {Promise<Task>}
 */
taskSchema.methods.addWatcher = async function(userId) {
  if (!this.watchers.includes(userId)) {
    this.watchers.push(userId);
    return await this.save();
  }
  return this;
};

/**
 * Remove a watcher from the task
 * @param {ObjectId} userId - User ID to remove as watcher
 * @returns {Promise<Task>}
 */
taskSchema.methods.removeWatcher = async function(userId) {
  this.watchers = this.watchers.filter(watcherId => 
    watcherId.toString() !== userId.toString()
  );
  return await this.save();
};

// Static Methods

/**
 * Find tasks by assignee
 * @param {ObjectId} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>}
 */
taskSchema.statics.findByAssignee = function(userId, options = {}) {
  const query = { assignedTo: userId };
  if (options.status) query.status = options.status;

  return this.find(query)
    .populate('assignedBy', 'firstName lastName email')
    .populate('assignedTo', 'firstName lastName email')
    .sort(options.sort || { createdAt: -1 });
};

/**
 * Find overdue tasks
 * @returns {Promise<Array>}
 */
taskSchema.statics.findOverdueTasks = function() {
  return this.find({
    dueDate: { $lt: new Date() },
    status: { $nin: [TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED] }
  }).populate('assignedTo assignedBy', 'firstName lastName email');
};

/**
 * Get task statistics for a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Object>}
 */
taskSchema.statics.getTaskStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { assignedTo: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalTime: { $sum: '$timeTracking.totalTimeSpent' }
      }
    }
  ]);
  
  return stats.reduce((acc, stat) => {
    acc[stat._id] = {
      count: stat.count,
      totalHours: Math.round((stat.totalTime / (1000 * 60 * 60)) * 100) / 100
    };
    return acc;
  }, {});
};

/**
 * Find tasks with active time tracking
 * @returns {Promise<Array>}
 */
taskSchema.statics.findActivelyTrackedTasks = function() {
  return this.find({ 'timeTracking.isActive': true })
    .populate('assignedTo', 'firstName lastName email');
};

const Task = mongoose.model('Task', taskSchema);

export default Task;
