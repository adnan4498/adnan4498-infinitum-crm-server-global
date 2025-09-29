import express from 'express';
import AttendanceController from '../controllers/attendanceController.js';
import { authenticate } from '../middleware/auth.js';
import { USER_ROLES } from '../config/constants.js';

const router = express.Router();

// All attendance routes require authentication
router.use(authenticate);

// Employee routes
router.post('/check-in', AttendanceController.checkIn);
router.post('/check-out', AttendanceController.checkOut);
router.get('/today', AttendanceController.getTodayAttendance);
router.get('/history', AttendanceController.getAttendanceHistory);
router.get('/summary', AttendanceController.getAttendanceSummary);
router.delete('/reset-today', AttendanceController.resetTodayAttendance);

// Admin routes (require admin or project_manager role)
router.get('/admin/all', (req, res, next) => {
  if (req.user.role !== USER_ROLES.ADMIN && req.user.role !== USER_ROLES.PROJECT_MANAGER) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin or Project Manager role required.',
      error: 'Insufficient permissions'
    });
  }
  next();
}, AttendanceController.getAllAttendance);

router.get('/admin/summary', (req, res, next) => {
  if (req.user.role !== USER_ROLES.ADMIN && req.user.role !== USER_ROLES.PROJECT_MANAGER) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin or Project Manager role required.',
      error: 'Insufficient permissions'
    });
  }
  next();
}, AttendanceController.getAllAttendanceSummary);

export default router;