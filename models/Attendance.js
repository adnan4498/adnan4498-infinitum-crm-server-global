import mongoose from 'mongoose';

/**
 * Attendance Schema
 * Tracks employee check-in and check-out times with late/early calculations
 */
const attendanceSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Employee is required']
  },

  date: {
    type: Date,
    required: [true, 'Date is required']
  },

  checkIn: {
    time: {
      type: Date,
      default: null
    },
    isLate: {
      type: Boolean,
      default: false
    },
    lateMinutes: {
      type: Number,
      default: 0
    }
  },

  checkOut: {
    time: {
      type: Date,
      default: null
    },
    isEarly: {
      type: Boolean,
      default: false
    },
    earlyMinutes: {
      type: Number,
      default: 0
    }
  },

  status: {
    type: String,
    enum: ['present', 'absent', 'half_day', 'late', 'early_out'],
    default: 'present'
  },

  totalHours: {
    type: Number,
    default: 0
  },

  workingHours: {
    type: Number,
    default: 0
  },

  breakHours: {
    type: Number,
    default: 0
  },

  overtimeHours: {
    type: Number,
    default: 0
  },

  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ employee: 1, date: -1 });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ status: 1 });

// Virtual for formatted date
attendanceSchema.virtual('formattedDate').get(function() {
  return this.date.toISOString().split('T')[0];
});

// Virtual for attendance duration
attendanceSchema.virtual('duration').get(function() {
  if (this.checkIn.time && this.checkOut.time) {
    return Math.round((this.checkOut.time - this.checkIn.time) / (1000 * 60)); // minutes
  }
  return 0;
});

// Pre-save middleware to calculate late/early status
attendanceSchema.pre('save', function(next) {
  // Check-in time validation (9:30 PM cutoff for late)
  if (this.checkIn.time) {
    const checkInTime = new Date(this.checkIn.time);
    const lateCutoff = new Date(checkInTime);
    lateCutoff.setHours(21, 30, 0, 0); // 9:30 PM

    if (checkInTime > lateCutoff) {
      this.checkIn.isLate = true;
      this.checkIn.lateMinutes = Math.round((checkInTime - lateCutoff) / (1000 * 60));
      this.status = 'late';
    }
  }

  // Check-out time validation (6:00 AM cutoff for early out)
  if (this.checkOut.time) {
    const checkOutTime = new Date(this.checkOut.time);
    const earlyCutoff = new Date(checkOutTime);
    earlyCutoff.setHours(6, 0, 0, 0); // 6:00 AM

    if (checkOutTime < earlyCutoff) {
      this.checkOut.isEarly = true;
      this.checkOut.earlyMinutes = Math.round((earlyCutoff - checkOutTime) / (1000 * 60));
      this.status = this.status === 'late' ? 'late' : 'early_out';
    }
  }

  // Calculate total hours if both check-in and check-out exist
  if (this.checkIn.time && this.checkOut.time) {
    const durationMs = this.checkOut.time - this.checkIn.time;
    this.totalHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100; // hours with 2 decimal places

    // Standard working hours: 9:30 PM to 6 AM = 8.5 hours
    const standardHours = 8.5;
    if (this.totalHours >= standardHours) {
      this.workingHours = standardHours;
      this.overtimeHours = Math.max(0, this.totalHours - standardHours);
    } else {
      this.workingHours = this.totalHours;
    }
  }

  next();
});

// Static methods

/**
 * Check if employee has already checked in today
 * @param {ObjectId} employeeId - Employee ID
 * @param {Date} date - Date to check
 * @returns {Promise<boolean>}
 */
attendanceSchema.statics.hasCheckedInToday = async function(employeeId, date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const attendance = await this.findOne({
    employee: employeeId,
    date: { $gte: startOfDay, $lte: endOfDay }
  });

  return attendance && attendance.checkIn.time;
};

/**
 * Check if employee has already checked out today
 * @param {ObjectId} employeeId - Employee ID
 * @param {Date} date - Date to check
 * @returns {Promise<boolean>}
 */
attendanceSchema.statics.hasCheckedOutToday = async function(employeeId, date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const attendance = await this.findOne({
    employee: employeeId,
    date: { $gte: startOfDay, $lte: endOfDay }
  });

  return attendance && attendance.checkOut.time;
};

/**
 * Get today's attendance for employee
 * @param {ObjectId} employeeId - Employee ID
 * @param {Date} date - Date to check
 * @returns {Promise<Object>}
 */
attendanceSchema.statics.getTodayAttendance = async function(employeeId, date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return await this.findOne({
    employee: employeeId,
    date: { $gte: startOfDay, $lte: endOfDay }
  }).populate('employee', 'firstName lastName email');
};

/**
 * Get attendance summary for employee in date range
 * @param {ObjectId} employeeId - Employee ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>}
 */
attendanceSchema.statics.getAttendanceSummary = async function(employeeId, startDate, endDate) {
  const attendance = await this.find({
    employee: employeeId,
    date: { $gte: startDate, $lte: endDate }
  });

  const summary = {
    totalDays: attendance.length,
    presentDays: attendance.filter(a => a.status === 'present' || a.status === 'late').length,
    absentDays: attendance.filter(a => a.status === 'absent').length,
    lateDays: attendance.filter(a => a.checkIn.isLate).length,
    earlyOutDays: attendance.filter(a => a.checkOut.isEarly).length,
    totalHours: attendance.reduce((sum, a) => sum + (a.totalHours || 0), 0),
    workingHours: attendance.reduce((sum, a) => sum + (a.workingHours || 0), 0),
    overtimeHours: attendance.reduce((sum, a) => sum + (a.overtimeHours || 0), 0)
  };

  return summary;
};

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance;