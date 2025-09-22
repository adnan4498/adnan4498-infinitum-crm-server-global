import Notification from '../models/Notification.js';
import { validatePagination, sanitizeInput } from '../utils/validation.js';
import {
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  NOTIFICATION_STATUS
} from '../config/constants.js';

class NotificationController {
  static async getNotifications(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        type,
        priority
      } = req.query;

      const { page: validPage, limit: validLimit, skip } = validatePagination(page, limit);

      const options = {
        limit: validLimit,
        skip,
        status,
        type,
        priority
      };

      const [notifications, total] = await Promise.all([
        Notification.findForUser(req.user._id, options),
        Notification.countDocuments({
          recipient: req.user._id,
          ...(status && { status }),
          ...(type && { type }),
          ...(priority && { priority })
        })
      ]);

      const totalPages = Math.ceil(total / validLimit);
      const hasNextPage = validPage < totalPages;
      const hasPrevPage = validPage > 1;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Notifications retrieved successfully',
        data: {
          notifications: notifications.map(n => n.getDisplayData()),
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
      console.error('Get notifications error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to retrieve notifications'
      });
    }
  }


  static async markAsRead(req, res) {
    try {
      const { id } = req.params;

      const notification = await Notification.findOne({
        _id: id,
        recipient: req.user._id
      });

      if (!notification) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          error: 'Notification not found'
        });
      }

      await notification.markAsRead();

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.SUCCESS,
        data: { notification: notification.getDisplayData() }
      });
    } catch (error) {
      console.error('Mark as read error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to mark notification as read'
      });
    }
  }

  static async markAllAsRead(req, res) {
    try {
      const result = await Notification.markAllAsRead(req.user._id);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'All notifications marked as read',
        data: { modifiedCount: result.modifiedCount }
      });
    } catch (error) {
      console.error('Mark all as read error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to mark all notifications as read'
      });
    }
  }

  static async deleteNotification(req, res) {
    try {
      const { id } = req.params;

      const notification = await Notification.findOneAndDelete({
        _id: id,
        recipient: req.user._id
      });

      if (!notification) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          error: 'Notification not found'
        });
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Notification deleted successfully',
        data: null
      });
    } catch (error) {
      console.error('Delete notification error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to delete notification'
      });
    }
  }

  static async getNotificationStats(req, res) {
    try {
      const stats = await Notification.getStats(req.user._id);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Notification stats retrieved successfully',
        data: { stats }
      });
    } catch (error) {
      console.error('Get notification stats error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to retrieve notification stats'
      });
    }
  }
}

export default NotificationController;