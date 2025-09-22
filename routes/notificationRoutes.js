import express from 'express';
import NotificationController from '../controllers/notificationController.js';
import { authenticate } from '../middleware/auth.js';
import {
  validateObjectId,
  validateQueryParams
} from '../utils/validation.js';

const router = express.Router();

router.use(authenticate);

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications
 * @access  Private
 * @query   { page?, limit?, status?, type?, priority? }
 */
router.get('/',
  validateQueryParams,
  NotificationController.getNotifications
);


/**
 * @route   GET /api/notifications/stats
 * @desc    Get notification statistics
 * @access  Private
 */
router.get('/stats', NotificationController.getNotificationStats);

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put('/:id/read',
  validateObjectId('id'),
  NotificationController.markAsRead
);

/**
 * @route   PUT /api/notifications/mark-all-read
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put('/mark-all-read', NotificationController.markAllAsRead);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete notification
 * @access  Private
 */
router.delete('/:id',
  validateObjectId('id'),
  NotificationController.deleteNotification
);

export default router;