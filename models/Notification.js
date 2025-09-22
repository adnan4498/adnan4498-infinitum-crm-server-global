import mongoose from 'mongoose';
import { NOTIFICATION_TYPES, NOTIFICATION_STATUS } from '../config/constants.js';

/**
 * Notification Schema
 * Handles real-time notifications for task updates and system events
 */
const notificationSchema = new mongoose.Schema({
  // Recipient Information
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Notification recipient is required']
  },
  
  // Sender Information (optional for system notifications)
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Notification Content
  type: {
    type: String,
    enum: Object.values(NOTIFICATION_TYPES),
    required: [true, 'Notification type is required']
  },
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    trim: true,
    maxlength: [500, 'Message cannot exceed 500 characters']
  },
  
  // Status and Metadata
  status: {
    type: String,
    enum: Object.values(NOTIFICATION_STATUS),
    default: NOTIFICATION_STATUS.UNREAD,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Related Entity Information
  relatedEntity: {
    entityType: {
      type: String,
      enum: ['task', 'user', 'project', 'system'],
      required: true
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: function() {
        return this.relatedEntity.entityType !== 'system';
      }
    }
  },
  
  // Action Information
  action: {
    type: String,
    enum: [
      'created', 'updated', 'deleted', 'assigned', 'unassigned',
      'started', 'completed', 'overdue', 'commented', 'approved',
      'rejected', 'reminder'
    ],
    required: true
  },
  
  // Additional Data
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Delivery Information
  channels: {
    inApp: {
      delivered: {
        type: Boolean,
        default: false
      },
      deliveredAt: Date
    },
    email: {
      enabled: {
        type: Boolean,
        default: false
      },
      delivered: {
        type: Boolean,
        default: false
      },
      deliveredAt: Date,
      emailId: String
    },
    push: {
      enabled: {
        type: Boolean,
        default: false
      },
      delivered: {
        type: Boolean,
        default: false
      },
      deliveredAt: Date,
      pushId: String
    },
    sms: {
      enabled: {
        type: Boolean,
        default: false
      },
      delivered: {
        type: Boolean,
        default: false
      },
      deliveredAt: Date,
      smsId: String
    }
  },
  
  // Scheduling
  scheduledFor: {
    type: Date,
    default: null
  },
  
  // Read Information
  readAt: {
    type: Date,
    default: null
  },
  
  // Expiry
  expiresAt: {
    type: Date,
    default: function() {
      // Default expiry: 30 days from creation
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
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

// Check if notification is read
notificationSchema.virtual('isRead').get(function() {
  return this.status === NOTIFICATION_STATUS.READ;
});

// Check if notification is expired
notificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Time since notification was created
notificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
});

// Indexes for better query performance
notificationSchema.index({ recipient: 1, status: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ 'relatedEntity.entityType': 1, 'relatedEntity.entityId': 1 });
notificationSchema.index({ expiresAt: 1 });
notificationSchema.index({ scheduledFor: 1 });

// Pre-save middleware to set delivery status for in-app notifications
notificationSchema.pre('save', function(next) {
  if (this.isNew) {
    // Always enable in-app notifications
    this.channels.inApp.delivered = true;
    this.channels.inApp.deliveredAt = new Date();
    
    // Check user preferences for other channels
    if (this.recipient) {
      // This would be populated from user preferences in a real implementation
      // For now, we'll set defaults
      this.channels.email.enabled = false; // Will be set based on user preference
      this.channels.push.enabled = true;
      this.channels.sms.enabled = false;
    }
  }
  next();
});

// Instance Methods

/**
 * Mark notification as read
 * @returns {Promise<Notification>}
 */
notificationSchema.methods.markAsRead = async function() {
  this.status = NOTIFICATION_STATUS.READ;
  this.readAt = new Date();
  return await this.save();
};

/**
 * Mark notification as unread
 * @returns {Promise<Notification>}
 */
notificationSchema.methods.markAsUnread = async function() {
  this.status = NOTIFICATION_STATUS.UNREAD;
  this.readAt = null;
  return await this.save();
};

/**
 * Check if notification should be delivered via specific channel
 * @param {string} channel - Channel name (email, push, sms)
 * @returns {boolean}
 */
notificationSchema.methods.shouldDeliverVia = function(channel) {
  return this.channels[channel]?.enabled && !this.channels[channel]?.delivered;
};

/**
 * Mark channel as delivered
 * @param {string} channel - Channel name
 * @param {string} deliveryId - External delivery ID
 * @returns {Promise<Notification>}
 */
notificationSchema.methods.markChannelAsDelivered = async function(channel, deliveryId = null) {
  if (this.channels[channel]) {
    this.channels[channel].delivered = true;
    this.channels[channel].deliveredAt = new Date();
    if (deliveryId) {
      this.channels[channel][`${channel}Id`] = deliveryId;
    }
    return await this.save();
  }
  return this;
};

/**
 * Get notification display data
 * @returns {Object}
 */
notificationSchema.methods.getDisplayData = function() {
  return {
    id: this._id,
    type: this.type,
    title: this.title,
    message: this.message,
    priority: this.priority,
    status: this.status,
    isRead: this.isRead,
    timeAgo: this.timeAgo,
    createdAt: this.createdAt,
    data: this.data,
    relatedEntity: this.relatedEntity
  };
};

// Static Methods

/**
 * Find notifications for a user
 * @param {ObjectId} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>}
 */
notificationSchema.statics.findForUser = function(userId, options = {}) {
  const query = { recipient: userId };
  
  if (options.status) query.status = options.status;
  if (options.type) query.type = options.type;
  if (options.priority) query.priority = options.priority;
  
  const limit = options.limit || 50;
  const skip = options.skip || 0;
  
  return this.find(query)
    .populate('sender', 'firstName lastName avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

/**
 * Get unread count for a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<number>}
 */
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    recipient: userId,
    status: NOTIFICATION_STATUS.UNREAD
  });
};

/**
 * Mark all notifications as read for a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Object>}
 */
notificationSchema.statics.markAllAsRead = function(userId) {
  return this.updateMany(
    { recipient: userId, status: NOTIFICATION_STATUS.UNREAD },
    { 
      status: NOTIFICATION_STATUS.READ,
      readAt: new Date()
    }
  );
};

/**
 * Create a task-related notification
 * @param {Object} params - Notification parameters
 * @returns {Promise<Notification>}
 */
notificationSchema.statics.createTaskNotification = async function({
  recipientId,
  senderId = null,
  task,
  type,
  action,
  customMessage = null
}) {
  const messages = {
    [NOTIFICATION_TYPES.TASK_ASSIGNED]: `You have been assigned a new task: "${task.title}"`,
    [NOTIFICATION_TYPES.TASK_COMPLETED]: `Task "${task.title}" has been completed`,
    [NOTIFICATION_TYPES.TASK_STARTED]: `Task "${task.title}" has been started`,
    [NOTIFICATION_TYPES.TASK_OVERDUE]: `Task "${task.title}" is overdue`,
    [NOTIFICATION_TYPES.TASK_UPDATED]: `Task "${task.title}" has been updated`
  };
  
  const titles = {
    [NOTIFICATION_TYPES.TASK_ASSIGNED]: 'New Task Assigned',
    [NOTIFICATION_TYPES.TASK_COMPLETED]: 'Task Completed',
    [NOTIFICATION_TYPES.TASK_STARTED]: 'Task Started',
    [NOTIFICATION_TYPES.TASK_OVERDUE]: 'Task Overdue',
    [NOTIFICATION_TYPES.TASK_UPDATED]: 'Task Updated'
  };
  
  const notification = new this({
    recipient: recipientId,
    sender: senderId,
    type,
    title: titles[type] || 'Task Notification',
    message: customMessage || messages[type] || 'Task notification',
    relatedEntity: {
      entityType: 'task',
      entityId: task._id
    },
    action,
    data: {
      taskId: task._id,
      taskTitle: task.title,
      taskPriority: task.priority,
      taskDueDate: task.dueDate,
      assignedBy: senderId
    },
    priority: task.priority === 'urgent' ? 'urgent' : 'medium'
  });
  
  return await notification.save();
};

/**
 * Clean up expired notifications
 * @returns {Promise<Object>}
 */
notificationSchema.statics.cleanupExpired = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

/**
 * Get notification statistics for a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Object>}
 */
notificationSchema.statics.getStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { recipient: userId } },
    {
      $group: {
        _id: '$type',
        total: { $sum: 1 },
        unread: {
          $sum: {
            $cond: [{ $eq: ['$status', NOTIFICATION_STATUS.UNREAD] }, 1, 0]
          }
        }
      }
    }
  ]);

  const totalUnread = await this.countDocuments({
    recipient: userId,
    status: NOTIFICATION_STATUS.UNREAD
  });

  return {
    totalUnread,
    byType: stats.reduce((acc, stat) => {
      acc[stat._id] = {
        total: stat.total,
        unread: stat.unread
      };
      return acc;
    }, {})
  };
};

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;