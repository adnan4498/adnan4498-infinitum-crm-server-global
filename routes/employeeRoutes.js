import express from 'express';
import EmployeeController from '../controllers/employeeController.js';
import { 
  authenticate, 
  authorize, 
  isAdminOrPM, 
  isAdmin,
  isOwnerOrAuthorized 
} from '../middleware/auth.js';
import {
  validateUserRegistration,
  validateUserUpdate,
  validateObjectId,
  validateQueryParams,
  validateSearchQuery
} from '../utils/validation.js';

const router = express.Router();

/**
 * Employee Management Routes
 * Base path: /api/employees
 * All routes require authentication
 */

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @route   GET /api/employees/search
 * @desc    Search employees by name, email, or employee ID
 * @access  Private (Admin, PM)
 * @query   q (required), limit (optional)
 */
router.get('/search',
  isAdminOrPM,
  validateSearchQuery,
  EmployeeController.searchEmployees
);

/**
 * @route   GET /api/employees/stats
 * @desc    Get employee statistics
 * @access  Private (Admin, PM)
 */
router.get('/stats',
  isAdminOrPM,
  EmployeeController.getEmployeeStats
);

/**
 * @route   GET /api/employees/role/:role
 * @desc    Get employees by role
 * @access  Private (Admin, PM)
 * @params  role (admin|project_manager|employee)
 * @query   page, limit
 */
router.get('/role/:role',
  isAdminOrPM,
  validateQueryParams,
  EmployeeController.getEmployeesByRole
);

/**
 * @route   GET /api/employees/designation/:designation
 * @desc    Get employees by designation
 * @access  Private (Admin, PM)
 * @params  designation (developer|designer|etc...)
 * @query   page, limit
 */
router.get('/designation/:designation',
  isAdminOrPM,
  validateQueryParams,
  EmployeeController.getEmployeesByDesignation
);

/**
 * @route   GET /api/employees
 * @desc    Get all employees with filtering and pagination
 * @access  Private (Admin, PM)
 * @query   page, limit, role, designation, department, isActive, search, sortBy, sortOrder
 */
router.get('/',
  authenticate,
  validateQueryParams,
  EmployeeController.getAllEmployees
);

/**
 * @route   POST /api/employees
 * @desc    Create new employee
 * @access  Private (Admin, PM)
 * @body    { firstName, lastName, email, password, designation, role?, phone?, department?, salary?, skills?, manager?, hireDate? }
 */
router.post('/',
  isAdminOrPM,
  validateUserRegistration,
  EmployeeController.createEmployee
);

/**
 * @route   GET /api/employees/:id
 * @desc    Get employee by ID
 * @access  Private (Admin, PM can view all; Employee can view own profile)
 * @params  id (ObjectId)
 */
router.get('/:id',
  validateObjectId('id'),
  isOwnerOrAuthorized,
  EmployeeController.getEmployeeById
);

/**
 * @route   PUT /api/employees/:id
 * @desc    Update employee
 * @access  Private (Admin can update all; PM can update non-admin; Employee can update own basic info)
 * @params  id (ObjectId)
 * @body    { firstName?, lastName?, phone?, designation?, department?, salary?, skills?, manager?, ... }
 */
router.put('/:id',
  validateObjectId('id'),
  isOwnerOrAuthorized,
  validateUserUpdate,
  EmployeeController.updateEmployee
);

/**
 * @route   DELETE /api/employees/:id
 * @desc    Delete/Deactivate employee
 * @access  Private (Admin, PM)
 * @params  id (ObjectId)
 * @query   permanent (optional, only admin can permanently delete)
 */
router.delete('/:id',
  validateObjectId('id'),
  isAdminOrPM,
  EmployeeController.deleteEmployee
);

/**
 * @route   POST /api/employees/:id/reactivate
 * @desc    Reactivate deactivated employee
 * @access  Private (Admin, PM)
 * @params  id (ObjectId)
 */
router.post('/:id/reactivate',
  validateObjectId('id'),
  isAdminOrPM,
  EmployeeController.reactivateEmployee
);

export default router;
