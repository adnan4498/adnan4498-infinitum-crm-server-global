import express from 'express';
import TaskController from '../controllers/taskController.js';
import {
  authenticate,
  authorize,
  isAdminOrPM,
  isOwnerOrAuthorized,
  canPerformAction
} from '../middleware/auth.js';
import {
  validateTaskCreation,
  validateTaskUpdate,
  validateComment,
  validateObjectId,
  validateQueryParams,
  validateDateRange
} from '../utils/validation.js';

const router = express.Router();

/**
 * Task Management Routes
 * Base path: /api/tasks
 * All routes require authentication
 */

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @route   GET /api/tasks/stats
 * @desc    Get task statistics
 * @access  Private (All authenticated users, filtered by role)
 */
router.get('/stats',
  TaskController.getTaskStats
);

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks with filtering and pagination
 * @access  Private (Admin/PM: all tasks, Employee: own tasks)
 * @query   page, limit, status, priority, assignedTo, assignedBy, search, sortBy, sortOrder, startDate, endDate
 */
router.get('/',
  validateQueryParams,
  validateDateRange,
  TaskController.getAllTasks
);

/**
 * @route   POST /api/tasks
 * @desc    Create new task
 * @access  Private (Admin, PM)
 * @body    { title, description, assignedTo, priority?, dueDate, estimatedHours?, category?, tags? }
 */
router.post('/',
  isAdminOrPM,
  validateTaskCreation,
  TaskController.createTask
);

/**
 * @route   GET /api/tasks/:id
 * @desc    Get task by ID
 * @access  Private (Admin/PM: all tasks, Employee: own tasks)
 * @params  id (ObjectId)
 */
router.get('/:id',
  validateObjectId('id'),
  TaskController.getTaskById
);

/**
 * @route   PUT /api/tasks/:id
 * @desc    Update task
 * @access  Private (Admin/PM: all fields, Employee: limited fields)
 * @params  id (ObjectId)
 * @body    Task update fields
 */
router.put('/:id',
  validateObjectId('id'),
  validateTaskUpdate,
  TaskController.updateTask
);

/**
 * @route   DELETE /api/tasks/:id
 * @desc    Delete task
 * @access  Private (Admin, PM)
 * @params  id (ObjectId)
 */
router.delete('/:id',
  validateObjectId('id'),
  isAdminOrPM,
  TaskController.deleteTask
);

/**
 * @route   POST /api/tasks/:id/start
 * @desc    Start task timer
 * @access  Private (Task assignee only)
 * @params  id (ObjectId)
 */
router.post('/:id/start',
  validateObjectId('id'),
  canPerformAction('start_task'),
  TaskController.startTask
);

/**
 * @route   POST /api/tasks/:id/stop
 * @desc    Stop task timer
 * @access  Private (Task assignee only)
 * @params  id (ObjectId)
 * @body    { notes? }
 */
router.post('/:id/stop',
  validateObjectId('id'),
  canPerformAction('start_task'),
  TaskController.stopTask
);

/**
 * @route   POST /api/tasks/:id/complete
 * @desc    Mark task as completed
 * @access  Private (Task assignee only)
 * @params  id (ObjectId)
 */
router.post('/:id/complete',
  validateObjectId('id'),
  canPerformAction('complete_task'),
  TaskController.completeTask
);

/**
 * @route   POST /api/tasks/:id/comments
 * @desc    Add comment to task
 * @access  Private (Admin/PM: all tasks, Employee: own tasks)
 * @params  id (ObjectId)
 * @body    { message }
 */
router.post('/:id/comments',
  validateObjectId('id'),
  validateComment,
  TaskController.addComment
);

export default router;