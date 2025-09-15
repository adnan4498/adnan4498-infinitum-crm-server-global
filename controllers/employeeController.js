import User from '../models/User.js';
import { validatePagination, sanitizeInput } from '../utils/validation.js';
import { 
  HTTP_STATUS, 
  ERROR_MESSAGES, 
  SUCCESS_MESSAGES, 
  USER_ROLES,
  USER_DESIGNATIONS 
} from '../config/constants.js';

/**
 * Employee Management Controller
 * Handles CRUD operations for employees and user management
 */
class EmployeeController {
  /**
   * Get all employees with filtering and pagination
   * GET /api/employees
   */
  static async getAllEmployees(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        role, 
        designation, 
        department, 
        isActive, 
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Validate pagination
      const { page: validPage, limit: validLimit, skip } = validatePagination(page, limit);

      // Build filter query
      const filter = {};
      
      if (role) filter.role = role;
      if (designation) filter.designation = designation;
      if (department) filter.department = new RegExp(department, 'i');
      if (isActive !== undefined) filter.isActive = isActive === 'true';

      // Search functionality
      if (search) {
        filter.$or = [
          { firstName: new RegExp(search, 'i') },
          { lastName: new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') },
          { employeeId: new RegExp(search, 'i') },
          { department: new RegExp(search, 'i') }
        ];
      }

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute query
      const [employees, total] = await Promise.all([
        User.find(filter)
          .select('-password')
          .populate('manager', 'firstName lastName email employeeId')
          .sort(sort)
          .skip(skip)
          .limit(validLimit),
        User.countDocuments(filter)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(total / validLimit);
      const hasNextPage = validPage < totalPages;
      const hasPrevPage = validPage > 1;

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Employees retrieved successfully',
        data: {
          employees,
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
      console.error('Get employees error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to retrieve employees'
      });
    }
  }

  /**
   * Get employee by ID
   * GET /api/employees/:id
   */
  static async getEmployeeById(req, res) {
    try {
      const { id } = req.params;

      const employee = await User.findById(id)
        .select('-password')
        .populate('manager', 'firstName lastName email employeeId designation');

      if (!employee) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.USER_NOT_FOUND,
          error: 'Employee not found'
        });
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Employee retrieved successfully',
        data: { employee }
      });
    } catch (error) {
      console.error('Get employee error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to retrieve employee'
      });
    }
  }

  /**
   * Create new employee
   * POST /api/employees
   */
  static async createEmployee(req, res) {
    try {
      const sanitizedData = sanitizeInput(req.body);
      const {
        firstName,
        lastName,
        email,
        password,
        role = USER_ROLES.EMPLOYEE,
        designation,
        phone,
        department,
        salary,
        skills = [],
        manager,
        hireDate
      } = sanitizedData;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          message: ERROR_MESSAGES.USER_ALREADY_EXISTS,
          error: 'Employee with this email already exists'
        });
      }

      // Only admin can create admin users
      if (role === USER_ROLES.ADMIN && req.user.role !== USER_ROLES.ADMIN) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: 'Only administrators can create admin accounts'
        });
      }

      // Validate manager exists if provided
      if (manager) {
        const managerExists = await User.findById(manager);
        if (!managerExists) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: ERROR_MESSAGES.VALIDATION_ERROR,
            error: 'Invalid manager ID'
          });
        }
      }

      // Create new employee
      const employeeData = {
        firstName,
        lastName,
        email,
        password,
        role,
        designation,
        phone,
        department,
        salary,
        skills,
        manager,
        hireDate: hireDate || new Date()
      };

      const newEmployee = new User(employeeData);
      await newEmployee.save();

      // Remove sensitive data
      const employeeResponse = newEmployee.toJSON();

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: SUCCESS_MESSAGES.USER_CREATED,
        data: { employee: employeeResponse }
      });
    } catch (error) {
      console.error('Create employee error:', error);

      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          message: ERROR_MESSAGES.USER_ALREADY_EXISTS,
          error: `Employee with this ${field} already exists`
        });
      }

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
        error: 'Failed to create employee'
      });
    }
  }

  /**
   * Update employee
   * PUT /api/employees/:id
   */
  static async updateEmployee(req, res) {
    try {
      const { id } = req.params;
      const sanitizedData = sanitizeInput(req.body);

      // Find employee
      const employee = await User.findById(id);
      if (!employee) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.USER_NOT_FOUND,
          error: 'Employee not found'
        });
      }

      // Check permissions for role changes
      if (sanitizedData.role && sanitizedData.role !== employee.role) {
        if (req.user.role !== USER_ROLES.ADMIN) {
          return res.status(HTTP_STATUS.FORBIDDEN).json({
            success: false,
            message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
            error: 'Only administrators can change user roles'
          });
        }
      }

      // Prevent admin from demoting themselves
      if (req.user._id.toString() === id && sanitizedData.role && sanitizedData.role !== USER_ROLES.ADMIN) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: 'You cannot change your own admin role'
        });
      }

      // Remove fields that shouldn't be updated directly
      const {
        password,
        employeeId,
        loginAttempts,
        lockUntil,
        isEmailVerified,
        ...allowedUpdates
      } = sanitizedData;

      // Validate manager if provided
      if (allowedUpdates.manager && allowedUpdates.manager !== employee.manager?.toString()) {
        const managerExists = await User.findById(allowedUpdates.manager);
        if (!managerExists) {
          return res.status(HTTP_STATUS.BAD_REQUEST).json({
            success: false,
            message: ERROR_MESSAGES.VALIDATION_ERROR,
            error: 'Invalid manager ID'
          });
        }
      }

      // Update employee
      const updatedEmployee = await User.findByIdAndUpdate(
        id,
        { ...allowedUpdates, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).select('-password').populate('manager', 'firstName lastName email employeeId');

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: SUCCESS_MESSAGES.USER_UPDATED,
        data: { employee: updatedEmployee }
      });
    } catch (error) {
      console.error('Update employee error:', error);

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
        error: 'Failed to update employee'
      });
    }
  }

  /**
   * Delete/Deactivate employee
   * DELETE /api/employees/:id
   */
  static async deleteEmployee(req, res) {
    try {
      const { id } = req.params;
      const { permanent = false } = req.query;

      const employee = await User.findById(id);
      if (!employee) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.USER_NOT_FOUND,
          error: 'Employee not found'
        });
      }

      // Prevent admin from deleting themselves
      if (req.user._id.toString() === id) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS,
          error: 'You cannot delete your own account'
        });
      }

      // Check if employee has active tasks
      const { default: Task } = await import('../models/Task.js');
      const activeTasks = await Task.countDocuments({
        assignedTo: id,
        status: { $in: ['pending', 'in_progress'] }
      });

      if (activeTasks > 0 && permanent === 'true') {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          error: `Cannot permanently delete employee with ${activeTasks} active tasks. Deactivate instead.`
        });
      }

      let result;
      let message;

      if (permanent === 'true' && req.user.role === USER_ROLES.ADMIN) {
        // Permanent deletion (only admin)
        result = await User.findByIdAndDelete(id);
        message = 'Employee permanently deleted';
      } else {
        // Soft delete (deactivation)
        result = await User.findByIdAndUpdate(
          id,
          { isActive: false, updatedAt: new Date() },
          { new: true }
        ).select('-password');
        message = 'Employee deactivated successfully';
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message,
        data: permanent === 'true' ? null : { employee: result }
      });
    } catch (error) {
      console.error('Delete employee error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to delete employee'
      });
    }
  }

  /**
   * Reactivate employee
   * POST /api/employees/:id/reactivate
   */
  static async reactivateEmployee(req, res) {
    try {
      const { id } = req.params;

      const employee = await User.findByIdAndUpdate(
        id,
        { isActive: true, updatedAt: new Date() },
        { new: true }
      ).select('-password');

      if (!employee) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: ERROR_MESSAGES.USER_NOT_FOUND,
          error: 'Employee not found'
        });
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Employee reactivated successfully',
        data: { employee }
      });
    } catch (error) {
      console.error('Reactivate employee error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to reactivate employee'
      });
    }
  }

  /**
   * Get employees by role
   * GET /api/employees/role/:role
   */
  static async getEmployeesByRole(req, res) {
    try {
      const { role } = req.params;
      const { page = 1, limit = 10 } = req.query;

      if (!Object.values(USER_ROLES).includes(role)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          error: 'Invalid role'
        });
      }

      const { page: validPage, limit: validLimit, skip } = validatePagination(page, limit);

      const [employees, total] = await Promise.all([
        User.find({ role, isActive: true })
          .select('-password')
          .populate('manager', 'firstName lastName email')
          .skip(skip)
          .limit(validLimit)
          .sort({ createdAt: -1 }),
        User.countDocuments({ role, isActive: true })
      ]);

      const totalPages = Math.ceil(total / validLimit);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: `${role} employees retrieved successfully`,
        data: {
          employees,
          pagination: {
            currentPage: validPage,
            totalPages,
            totalItems: total,
            itemsPerPage: validLimit
          }
        }
      });
    } catch (error) {
      console.error('Get employees by role error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to retrieve employees by role'
      });
    }
  }

  /**
   * Get employees by designation
   * GET /api/employees/designation/:designation
   */
  static async getEmployeesByDesignation(req, res) {
    try {
      const { designation } = req.params;
      const { page = 1, limit = 10 } = req.query;

      if (!Object.values(USER_DESIGNATIONS).includes(designation)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          error: 'Invalid designation'
        });
      }

      const { page: validPage, limit: validLimit, skip } = validatePagination(page, limit);

      const [employees, total] = await Promise.all([
        User.find({ designation, isActive: true })
          .select('-password')
          .populate('manager', 'firstName lastName email')
          .skip(skip)
          .limit(validLimit)
          .sort({ createdAt: -1 }),
        User.countDocuments({ designation, isActive: true })
      ]);

      const totalPages = Math.ceil(total / validLimit);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: `${designation} employees retrieved successfully`,
        data: {
          employees,
          pagination: {
            currentPage: validPage,
            totalPages,
            totalItems: total,
            itemsPerPage: validLimit
          }
        }
      });
    } catch (error) {
      console.error('Get employees by designation error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to retrieve employees by designation'
      });
    }
  }

  /**
   * Get employee statistics
   * GET /api/employees/stats
   */
  static async getEmployeeStats(req, res) {
    try {
      const [
        totalEmployees,
        activeEmployees,
        inactiveEmployees,
        roleStats,
        designationStats
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        User.countDocuments({ isActive: false }),
        User.aggregate([
          { $group: { _id: '$role', count: { $sum: 1 } } }
        ]),
        User.aggregate([
          { $group: { _id: '$designation', count: { $sum: 1 } } }
        ])
      ]);

      const stats = {
        totalEmployees,
        activeEmployees,
        inactiveEmployees,
        byRole: roleStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        byDesignation: designationStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {})
      };

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Employee statistics retrieved successfully',
        data: { stats }
      });
    } catch (error) {
      console.error('Get employee stats error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Failed to retrieve employee statistics'
      });
    }
  }

  /**
   * Search employees
   * GET /api/employees/search
   */
  static async searchEmployees(req, res) {
    try {
      const { q, limit = 10 } = req.query;

      if (!q || q.trim().length < 1) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: ERROR_MESSAGES.VALIDATION_ERROR,
          error: 'Search query is required'
        });
      }

      const searchRegex = new RegExp(q.trim(), 'i');
      const validLimit = Math.min(parseInt(limit) || 10, 50);

      const employees = await User.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { employeeId: searchRegex },
          { department: searchRegex }
        ],
        isActive: true
      })
        .select('firstName lastName email employeeId designation department role')
        .limit(validLimit)
        .sort({ firstName: 1 });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Search completed successfully',
        data: { 
          employees,
          query: q,
          count: employees.length
        }
      });
    } catch (error) {
      console.error('Search employees error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR,
        error: 'Search failed'
      });
    }
  }
}

export default EmployeeController;
