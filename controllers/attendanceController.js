import Attendance from '../models/Attendance.js';
import { validatePagination, sanitizeInput } from '../utils/validation.js';
import {
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
} from '../config/constants.js';

/**
 * Attendance Controller
 * Handles employee check-in, check-out, and attendance management
 */
class AttendanceController {
  /**
   * Check-in employee
   * POST /api/attendance/check-in
   */
  static async checkIn(req, res) {
    try {
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      // Check if already checked in today
      const hasCheckedIn = await Attendance.hasCheckedInToday(req.user._id, now);
      if (hasCheckedIn) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Already checked in today',
          error: 'You have already checked in for today'
        });
      }

      // Create or update attendance record
      let attendance = await Attendance.getTodayAttendance(req.user._id, now);

      if (!attendance) {
        // Create new attendance record
        attendance = new Attendance({
          employee: req.user._id,
          date: today,
          checkIn: {
            time: now
          }
        });
      } else {
        // Update existing record with check-in time
        attendance.checkIn.time = now;
      }

      await attendance.save();
      await attendance.populate('employee', 'firstName lastName email');

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
        data: {
          attendance,
          checkInTime: now.toISOString(),
          isLate: attendance.checkIn.isLate,
          lateMinutes: attendance.checkIn.lateMinutes
        }
      });
    } catch (error) {
      console.error('Check-in error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to check in'
      });
    }
  }

  /**
   * Check-out employee
   * POST /api/attendance/check-out
   */
  static async checkOut(req, res) {
    try {
      const now = new Date();

      // Get today's attendance
      let attendance = await Attendance.getTodayAttendance(req.user._id, now);

      if (!attendance) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Not checked in today',
          error: 'You must check in first before checking out'
        });
      }

      if (!attendance.checkIn.time) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Not checked in today',
          error: 'You must check in first before checking out'
        });
      }

      // Check if already checked out
      if (attendance.checkOut.time) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Already checked out today',
          error: 'You have already checked out for today'
        });
      }

      // Update with check-out time
      attendance.checkOut.time = now;
      await attendance.save();
      await attendance.populate('employee', 'firstName lastName email');

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Checked out successfully',
        data: {
          attendance,
          checkOutTime: now.toISOString(),
          isEarly: attendance.checkOut.isEarly,
          earlyMinutes: attendance.checkOut.earlyMinutes,
          totalHours: attendance.totalHours,
          workingHours: attendance.workingHours,
          overtimeHours: attendance.overtimeHours
        }
      });
    } catch (error) {
      console.error('Check-out error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to check out'
      });
    }
  }

  /**
   * Get today's attendance status
   * GET /api/attendance/today
   */
  static async getTodayAttendance(req, res) {
    try {
      const attendance = await Attendance.getTodayAttendance(req.user._id);

      if (!attendance) {
        return res.status(HTTP_STATUS.OK).json({
          success: true,
          message: 'No attendance record for today',
          data: {
            hasCheckedIn: false,
            hasCheckedOut: false,
            attendance: null
          }
        });
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Attendance retrieved successfully',
        data: {
          hasCheckedIn: !!attendance.checkIn.time,
          hasCheckedOut: !!attendance.checkOut.time,
          attendance,
          checkInTime: attendance.checkIn.time,
          checkOutTime: attendance.checkOut.time,
          isLate: attendance.checkIn.isLate,
          isEarly: attendance.checkOut.isEarly,
          totalHours: attendance.totalHours,
          workingHours: attendance.workingHours,
          overtimeHours: attendance.overtimeHours
        }
      });
    } catch (error) {
      console.error('Get today attendance error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to get today\'s attendance'
      });
    }
  }

  /**
   * Get attendance history for employee
   * GET /api/attendance/history
   */
  static async getAttendanceHistory(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        startDate,
        endDate
      } = req.query;

      const { page: validPage, limit: validLimit, skip } = validatePagination(page, limit);

      let filter = { employee: req.user._id };

      if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) filter.date.$lte = new Date(endDate);
      }

      const [attendance, total] = await Promise.all([
        Attendance.find(filter)
          .sort({ date: -1 })
          .skip(skip)
          .limit(validLimit),
        Attendance.countDocuments(filter)
      ]);

      const totalPages = Math.ceil(total / validLimit);
      const hasNextPage = validPage < totalPages;
      const hasPrevPage = validPage > 1;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Attendance history retrieved successfully',
        data: {
          attendance,
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
      console.error('Get attendance history error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to get attendance history'
      });
    }
  }

  /**
   * Get attendance summary for date range
   * GET /api/attendance/summary
   */
  static async getAttendanceSummary(req, res) {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Start date and end date are required',
          error: 'Please provide both startDate and endDate parameters'
        });
      }

      const summary = await Attendance.getAttendanceSummary(
        req.user._id,
        new Date(startDate),
        new Date(endDate)
      );

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Attendance summary retrieved successfully',
        data: { summary }
      });
    } catch (error) {
      console.error('Get attendance summary error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to get attendance summary'
      });
    }
  }

  /**
   * Admin: Get all attendance records
   * GET /api/attendance/admin/all
   */
  static async getAllAttendance(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        employee,
        date,
        status,
        startDate,
        endDate
      } = req.query;

      const { page: validPage, limit: validLimit, skip } = validatePagination(page, limit);

      let filter = {};

      if (employee) filter.employee = employee;
      if (status) filter.status = status;

      if (date) {
        const targetDate = new Date(date);
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);
        filter.date = { $gte: startOfDay, $lte: endOfDay };
      }

      if (startDate || endDate) {
        filter.date = filter.date || {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) filter.date.$lte = new Date(endDate);
      }

      const [attendance, total] = await Promise.all([
        Attendance.find(filter)
          .populate('employee', 'firstName lastName email employeeId designation')
          .sort({ date: -1, 'employee.firstName': 1 })
          .skip(skip)
          .limit(validLimit),
        Attendance.countDocuments(filter)
      ]);

      const totalPages = Math.ceil(total / validLimit);
      const hasNextPage = validPage < totalPages;
      const hasPrevPage = validPage > 1;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'All attendance records retrieved successfully',
        data: {
          attendance,
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
      console.error('Get all attendance error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to get attendance records'
      });
    }
  }

  /**
   * Admin: Get attendance summary for all employees
   * GET /api/attendance/admin/summary
   */
  static async getAllAttendanceSummary(req, res) {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Start date and end date are required',
          error: 'Please provide both startDate and endDate parameters'
        });
      }

      // Get all employees and their attendance summaries
      const attendanceRecords = await Attendance.find({
        date: { $gte: new Date(startDate), $lte: new Date(endDate) }
      }).populate('employee', 'firstName lastName email employeeId designation');

      // Group by employee
      const employeeSummaries = {};
      attendanceRecords.forEach(record => {
        const employeeId = record.employee._id.toString();
        if (!employeeSummaries[employeeId]) {
          employeeSummaries[employeeId] = {
            employee: record.employee,
            totalDays: 0,
            presentDays: 0,
            absentDays: 0,
            lateDays: 0,
            earlyOutDays: 0,
            totalHours: 0,
            workingHours: 0,
            overtimeHours: 0
          };
        }

        const summary = employeeSummaries[employeeId];
        summary.totalDays++;
        summary.totalHours += record.totalHours || 0;
        summary.workingHours += record.workingHours || 0;
        summary.overtimeHours += record.overtimeHours || 0;

        if (record.status === 'present' || record.status === 'late') {
          summary.presentDays++;
        } else if (record.status === 'absent') {
          summary.absentDays++;
        }

        if (record.checkIn.isLate) summary.lateDays++;
        if (record.checkOut.isEarly) summary.earlyOutDays++;
      });

      const summaries = Object.values(employeeSummaries);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'All attendance summaries retrieved successfully',
        data: { summaries }
      });
    } catch (error) {
      console.error('Get all attendance summary error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to get attendance summaries'
      });
    }
  }

  /**
   * Delete/reset today's attendance (for testing purposes)
   * DELETE /api/attendance/reset-today
   */
  static async resetTodayAttendance(req, res) {
    try {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const result = await Attendance.findOneAndDelete({
        employee: req.user._id,
        date: { $gte: startOfDay, $lte: endOfDay }
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Today\'s attendance has been reset',
        data: {
          deleted: !!result,
          resetTime: now.toISOString()
        }
      });
    } catch (error) {
      console.error('Reset today attendance error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to reset today\'s attendance'
      });
    }
  }
}

export default AttendanceController;