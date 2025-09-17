import express from 'express';
import TaskController from '../controllers/taskController.js';
import {
  authenticate,
  isAdminOrPM,
  isOwnerOrAuthorized,
  canPerformAction,
  canCreateTasks
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

router.use(authenticate);

router.get('/stats', TaskController.getTaskStats);

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
  canCreateTasks,
  validateTaskCreation,
  TaskController.createTask
);

router.get('/:id',
  validateObjectId('id'),
  TaskController.getTaskById
);

router.put('/:id',
  validateObjectId('id'),
  validateTaskUpdate,
  TaskController.updateTask
);

router.delete('/:id',
  validateObjectId('id'),
  isAdminOrPM,
  TaskController.deleteTask
);

router.post('/:id/start',
  validateObjectId('id'),
  canPerformAction('start_task'),
  TaskController.startTask
);

router.post('/:id/stop',
  validateObjectId('id'),
  canPerformAction('start_task'),
  TaskController.stopTask
);

router.post('/:id/complete',
  validateObjectId('id'),
  canPerformAction('complete_task'),
  TaskController.completeTask
);

router.post('/:id/comments',
  validateObjectId('id'),
  validateComment,
  TaskController.addComment
);

export default router;