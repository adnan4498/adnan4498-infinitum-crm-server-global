import Task from '../models/Task.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { validatePagination, sanitizeInput } from '../utils/validation.js';
import {
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  TASK_STATUS,
  TASK_PRIORITY,
  USER_ROLES,
  NOTIFICATION_TYPES
} from '../config/constants.js';
import emailService from '../utils/emailService.js';

/**
 * Task Management Controller
 * Handles CRUD operations for tasks, time tracking, and notifications
 */
class TaskController {
  /**
   * Get all tasks with filtering and pagination
   * GET /api/tasks
   */
  static async getAllTasks(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        priority,
        assignedTo,
        assignedBy,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        startDate,
        endDate
      } = req.query;

      // Validate pagination
      const { page: validPage, limit: validLimit, skip } = validatePagination(page, limit);

      // Build filter query
      const filter = {};

      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (assignedTo) filter.assignedTo = assignedTo;
      if (assignedBy) filter.assignedBy = assignedBy;

      // Date range filter
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      // Search functionality
      if (search) {
        filter.$or = [
          { title: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') }
        ];
      }

      // Role-based filtering
      if (req.user.role === USER_ROLES.EMPLOYEE) {
        // Employees can see tasks assigned to them
        // Employees with project_manager designation can also see tasks they created
        if (req.user.designation === 'project_manager') {
          filter.$or = [
            { assignedTo: req.user._id }, // Tasks assigned to them
            { assignedBy: req.user._id }  // Tasks they created
          ];
        } else {
          // Regular employees can only see their own tasks
          filter.assignedTo = req.user._id;
        }
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute query
      const [tasks, total] = await Promise.all([
        Task.find(filter)
          .populate('assignedTo', 'firstName lastName email designation')
          .populate('assignedBy', 'firstName lastName email designation')
          .sort(sort)
          .skip(skip)
          .limit(validLimit),
        Task.countDocuments(filter)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(total / validLimit);
      const hasNextPage = validPage < totalPages;
      const hasPrevPage = validPage > 1;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Tasks retrieved successfully',
        data: {
          tasks,
          pagination: {
            currentPage: validPage,
            totalPages,
            totalItems: total,
            itemsPerPage: validLimit,
            hasNextPage,
            hasPrevPage
          }
        }
      });
    } catch (error) {
      console.error('Get tasks error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to retrieve tasks'
      });
    }
  }

  /**
   * Get task by ID
   * GET /api/tasks/:id
   */
  static async getTaskById(req, res) {
    try {
      const { id } = req.params;

      const task = await Task.findById(id)
        .populate('assignedTo', 'firstName lastName email designation phone')
        .populate('assignedBy', 'firstName lastName email designation')
        .populate('comments.user', 'firstName lastName avatar')
        .populate('watchers', 'firstName lastName avatar');

      if (!task) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_FOUND,
          error: 'Task not found'
        });
      }

      // Check permissions
      if (req.user.role === USER_ROLES.EMPLOYEE && task.assignedTo._id.toString() !== req.user._id.toString()) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: 'You can only view your own tasks'
        });
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Task retrieved successfully',
        data: { task }
      });
    } catch (error) {
      console.error('Get task error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to retrieve task'
      });
    }
  }

  /**
   * Create new task
   * POST /api/tasks
   */
  static async createTask(req, res) {
    try {
      const sanitizedData = sanitizeInput(req.body);
      const {
        title,
        description,
        assignedTo,
        priority = TASK_PRIORITY.MEDIUM,
        dueDate,
        estimatedHours,
        category,
        tags = []
      } = sanitizedData;

      // Validate assigned user exists and is active
      const assignedUser = await User.findById(assignedTo);
      if (!assignedUser || !assignedUser.isActive) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          error: 'Invalid or inactive user assigned to task'
        });
      }

      // Create task
      const taskData = {
        title,
        description,
        assignedTo,
        assignedBy: req.user._id,
        priority,
        dueDate: new Date(dueDate),
        estimatedHours,
        category,
        tags
      };

      const newTask = new Task(taskData);
      await newTask.save();

      // Populate the response
      await newTask.populate('assignedTo', 'firstName lastName email designation');
      await newTask.populate('assignedBy', 'firstName lastName email designation');

      // Send notification to assigned user
      try {
        await Notification.createTaskNotification({
          recipientId: assignedTo,
          senderId: req.user._id,
          task: newTask,
          type: NOTIFICATION_TYPES.TASK_ASSIGNED,
          action: 'assigned'
        });

        // Send email notification
        await emailService.sendTaskAssignedEmail(assignedUser.email, newTask, req.user);
      } catch (notificationError) {
        console.error('Notification error:', notificationError);
        // Don't fail the task creation if notification fails
      }

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: SUCCESS_MESSAGES.TASK_CREATED,
        data: { task: newTask }
      });
    } catch (error) {
      console.error('Create task error:', error);

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
        error: 'Failed to create task'
      });
    }
  }

  /**
   * Update task
   * PUT /api/tasks/:id
   */
  static async updateTask(req, res) {
    try {
      const { id } = req.params;
      const sanitizedData = sanitizeInput(req.body);

      const task = await Task.findById(id);
      if (!task) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_FOUND,
          error: 'Task not found'
        });
      }

      // Check permissions
      if (req.user.role === USER_ROLES.EMPLOYEE && task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: 'You can only update your own tasks'
        });
      }

      // Employees can only update certain fields
      if (req.user.role === USER_ROLES.EMPLOYEE) {
        const allowedFields = ['status', 'comments'];
        const requestedFields = Object.keys(sanitizedData);
        const unauthorizedFields = requestedFields.filter(field => !allowedFields.includes(field));

        if (unauthorizedFields.length > 0) {
          return res.status(HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
            error: `Employees can only update: ${allowedFields.join(', ')}`
          });
        }
      }

      // Update task
      const updatedTask = await Task.findByIdAndUpdate(
        id,
        { ...sanitizedData, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).populate('assignedTo assignedBy', 'firstName lastName email designation');

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.TASK_UPDATED,
        data: { task: updatedTask }
      });
    } catch (error) {
      console.error('Update task error:', error);

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
        error: 'Failed to update task'
      });
    }
  }

  /**
   * Delete task
   * DELETE /api/tasks/:id
   */
  static async deleteTask(req, res) {
    try {
      const { id } = req.params;

      const task = await Task.findById(id);
      if (!task) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_FOUND,
          error: 'Task not found'
        });
      }

      // Only admin and PM can delete tasks
      if (req.user.role === USER_ROLES.EMPLOYEE) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: 'Only administrators and project managers can delete tasks'
        });
      }

      await Task.findByIdAndDelete(id);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.TASK_DELETED,
        data: null
      });
    } catch (error) {
      console.error('Delete task error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to delete task'
      });
    }
  }

  /**
   * Start task timer
   * POST /api/tasks/:id/start
   */
  static async startTask(req, res) {
    try {
      const { id } = req.params;

      const task = await Task.findById(id);
      if (!task) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_FOUND,
          error: 'Task not found'
        });
      }

      // Check if user is assigned to this task
      if (task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_ASSIGNED,
          error: 'You can only start tasks assigned to you'
        });
      }

      // Start time tracking
      await task.startTimeTracking();

      // Send notification
      try {
        await Notification.createTaskNotification({
          recipientId: task.assignedBy,
          senderId: req.user._id,
          task,
          type: NOTIFICATION_TYPES.TASK_STARTED,
          action: 'started'
        });
      } catch (notificationError) {
        console.error('Notification error:', notificationError);
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.TASK_STARTED,
        data: { task }
      });
    } catch (error) {
      console.error('Start task error:', error);

      if (error.message.includes('already active')) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERROR_MESSAGES.TASK_ALREADY_STARTED,
          error: error.message
        });
      }

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to start task'
      });
    }
  }

  /**
   * Stop task timer
   * POST /api/tasks/:id/stop
   */
  static async stopTask(req, res) {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const task = await Task.findById(id);
      if (!task) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_FOUND,
          error: 'Task not found'
        });
      }

      // Check if user is assigned to this task
      if (task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_ASSIGNED,
          error: 'You can only stop tasks assigned to you'
        });
      }

      // Stop time tracking
      await task.stopTimeTracking(notes);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Task timer stopped successfully',
        data: { task }
      });
    } catch (error) {
      console.error('Stop task error:', error);

      if (error.message.includes('No active time tracking')) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          error: error.message
        });
      }

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to stop task timer'
      });
    }
  }

  /**
   * Complete task
   * POST /api/tasks/:id/complete
   */
  static async completeTask(req, res) {
    try {
      const { id } = req.params;

      const task = await Task.findById(id);
      if (!task) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_FOUND,
          error: 'Task not found'
        });
      }

      // Check if user is assigned to this task
      if (task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_ASSIGNED,
          error: 'You can only complete tasks assigned to you'
        });
      }

      // Mark as completed
      await task.markAsCompleted(req.user._id);

      // Send notification to assigner
      try {
        const assignedUser = await User.findById(task.assignedTo);
        await Notification.createTaskNotification({
          recipientId: task.assignedBy,
          senderId: req.user._id,
          task,
          type: NOTIFICATION_TYPES.TASK_COMPLETED,
          action: 'completed'
        });

        // Send email notification
        const assigner = await User.findById(task.assignedBy);
        if (assigner) {
          await emailService.sendTaskCompletedEmail(assigner.email, task, assignedUser);
        }
      } catch (notificationError) {
        console.error('Notification error:', notificationError);
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.TASK_COMPLETED,
        data: { task }
      });
    } catch (error) {
      console.error('Complete task error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to complete task'
      });
    }
  }

  /**
   * Get task statistics
   * GET /api/tasks/stats
   */
  static async getTaskStats(req, res) {
    try {
      let filter = {};

      // Role-based filtering
      if (req.user.role === USER_ROLES.EMPLOYEE) {
        // Employees can see tasks assigned to them
        // Employees with project_manager designation can also see tasks they created
        if (req.user.designation === 'project_manager') {
          filter.$or = [
            { assignedTo: req.user._id }, // Tasks assigned to them
            { assignedBy: req.user._id }  // Tasks they created
          ];
        } else {
          // Regular employees can only see their own tasks
          filter.assignedTo = req.user._id;
        }
      }

      const [
        totalTasks,
        statusStats,
        priorityStats,
        overdueTasks,
        activeTimers
      ] = await Promise.all([
        Task.countDocuments(filter),
        Task.aggregate([
          { $match: filter },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        Task.aggregate([
          { $match: filter },
          { $group: { _id: '$priority', count: { $sum: 1 } } }
        ]),
        Task.countDocuments({
          ...filter,
          dueDate: { $lt: new Date() },
          status: { $nin: [TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED] }
        }),
        Task.countDocuments({
          ...filter,
          'timeTracking.isActive': true
        })
      ]);

      const stats = {
        totalTasks,
        byStatus: statusStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        byPriority: priorityStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        overdueTasks,
        activeTimers
      };

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Task statistics retrieved successfully',
        data: { stats }
      });
    } catch (error) {
      console.error('Get task stats error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to retrieve task statistics'
      });
    }
  }

  /**
   * Add comment to task
   * POST /api/tasks/:id/comments
   */
  static async addComment(req, res) {
    try {
      const { id } = req.params;
      const { message } = req.body;

      const task = await Task.findById(id);
      if (!task) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_FOUND,
          error: 'Task not found'
        });
      }

      // Check permissions
      if (req.user.role === USER_ROLES.EMPLOYEE && task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: 'You can only comment on your own tasks'
        });
      }

      await task.addComment(req.user._id, message);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Comment added successfully',
        data: { task }
      });
    } catch (error) {
      console.error('Add comment error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to add comment'
      });
    }
  }
}

export default TaskController;