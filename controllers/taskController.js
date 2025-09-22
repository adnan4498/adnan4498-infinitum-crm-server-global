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

class TaskController {
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

      const { page: validPage, limit: validLimit, skip } = validatePagination(page, limit);
      const filter = {};

      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (assignedTo) filter.assignedTo = assignedTo;
      if (assignedBy) filter.assignedBy = assignedBy;

      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      if (search) {
        filter.$or = [
          { title: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') }
        ];
      }

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

      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const [tasks, total] = await Promise.all([
        Task.find(filter)
          .populate('assignedTo', 'firstName lastName email designation')
          .populate('assignedBy', 'firstName lastName email designation')
          .sort(sort)
          .skip(skip)
          .limit(validLimit),
        Task.countDocuments(filter)
      ]);

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

  static async createTask(req, res) {
    try {
      const sanitizedData = sanitizeInput(req.body);
      const {
        title,
        description,
        assignedTo,
        priority = TASK_PRIORITY.MEDIUM,
        dueDate,
        startDate,
        estimatedHours,
        category,
        tags = []
      } = sanitizedData;

      const assignedUser = await User.findById(assignedTo);
      if (!assignedUser || !assignedUser.isActive) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          error: 'Invalid or inactive user assigned to task'
        });
      }

      const taskData = {
        title,
        description,
        assignedTo,
        assignedBy: req.user._id,
        priority,
        dueDate: new Date(dueDate),
        startDate: startDate ? new Date(startDate) : null,
        estimatedHours,
        category,
        tags
      };

      const newTask = new Task(taskData);
      await newTask.save();

      await newTask.populate('assignedTo', 'firstName lastName email designation');
      await newTask.populate('assignedBy', 'firstName lastName email designation');

      try {
        await Notification.createTaskNotification({
          recipientId: assignedTo,
          senderId: req.user._id,
          task: newTask,
          type: NOTIFICATION_TYPES.TASK_ASSIGNED,
          action: 'assigned'
        });
        await emailService.sendTaskAssignedEmail(assignedUser.email, newTask, req.user);
      } catch (notificationError) {
        console.error('Notification error:', notificationError);
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

      if (req.user.role === USER_ROLES.EMPLOYEE && task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: 'You can only update your own tasks'
        });
      }

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

      // Check if user has permission to delete tasks
      const canDeleteTasks = req.user.role === USER_ROLES.ADMIN ||
        req.user.role === USER_ROLES.PROJECT_MANAGER ||
        (req.user.role === USER_ROLES.EMPLOYEE && req.user.designation === 'project_manager');

      if (!canDeleteTasks) {
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

      if (task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_ASSIGNED,
          error: 'You can only start tasks assigned to you'
        });
      }

      await task.startTimeTracking();

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

      if (task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_ASSIGNED,
          error: 'You can only stop tasks assigned to you'
        });
      }

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

      if (task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.TASK_NOT_ASSIGNED,
          error: 'You can only complete tasks assigned to you'
        });
      }

      await task.markAsCompleted(req.user._id);

      try {
        const assignedUser = await User.findById(task.assignedTo);
        await Notification.createTaskNotification({
          recipientId: task.assignedBy,
          senderId: req.user._id,
          task,
          type: NOTIFICATION_TYPES.TASK_COMPLETED,
          action: 'completed'
        });

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

  static async getTaskStats(req, res) {
    try {
      let filter = {};

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