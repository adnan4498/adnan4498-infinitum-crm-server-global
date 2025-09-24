import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Email Service
 * Handles sending emails for task notifications and other system communications
 */
class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  /**
   * Send email
   * @param {Object} options - Email options
   * @returns {Promise<Object>} Send result
   */
  async sendEmail({ to, subject, html, text }) {
    try {
      const mailOptions = {
        from: `"${process.env.APP_NAME || 'Task Management System'}" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
        text
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', result.messageId);
      return result;
    } catch (error) {
      console.error('Email send error:', error);
      throw error;
    }
  }

  /**
   * Send task assigned notification email
   * @param {string} recipientEmail - Recipient email
   * @param {Object} task - Task object
   * @param {Object} assigner - User who assigned the task
   */
  async sendTaskAssignedEmail(recipientEmail, task, assigner) {
    const subject = `New Task Assigned: ${task.title}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Task Assigned</h2>
        <p>Hello,</p>
        <p>You have been assigned a new task by <strong>${assigner.firstName} ${assigner.lastName}</strong>.</p>

        <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <h3 style="margin-top: 0; color: #333;">${task.title}</h3>
          <p><strong>Description:</strong> ${task.description}</p>
          <p><strong>Priority:</strong> ${task.priority.toUpperCase()}</p>
          <p><strong>Due Date:</strong> ${new Date(task.dueDate).toLocaleDateString()}</p>
          ${task.estimatedHours ? `<p><strong>Estimated Hours:</strong> ${task.estimatedHours}</p>` : ''}
          ${task.category ? `<p><strong>Category:</strong> ${task.category}</p>` : ''}
        </div>

        <p>Please log in to your account to start working on this task.</p>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This is an automated message from the Task Management System.
          </p>
        </div>
      </div>
    `;

    const text = `
      New Task Assigned: ${task.title}

      You have been assigned a new task by ${assigner.firstName} ${assigner.lastName}.

      Task Details:
      - Title: ${task.title}
      - Description: ${task.description}
      - Priority: ${task.priority.toUpperCase()}
      - Due Date: ${new Date(task.dueDate).toLocaleDateString()}
      ${task.estimatedHours ? `- Estimated Hours: ${task.estimatedHours}` : ''}
      ${task.category ? `- Category: ${task.category}` : ''}

      Please log in to your account to start working on this task.
    `;

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
      text
    });
  }

  /**
   * Send task completed notification email
   * @param {string} recipientEmail - Recipient email (assigner)
   * @param {Object} task - Task object
   * @param {Object} assignee - User who completed the task
   */
  async sendTaskCompletedEmail(recipientEmail, task, assignee) {
    const subject = `Task Completed: ${task.title}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">Task Completed</h2>
        <p>Hello,</p>
        <p><strong>${assignee.firstName} ${assignee.lastName}</strong> has completed the task assigned to them.</p>

        <div style="background-color: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <h3 style="margin-top: 0; color: #333;">${task.title}</h3>
          <p><strong>Description:</strong> ${task.description}</p>
          <p><strong>Completed By:</strong> ${assignee.firstName} ${assignee.lastName}</p>
          <p><strong>Completed Date:</strong> ${new Date(task.completedDate).toLocaleDateString()}</p>
          <p><strong>Total Time Spent:</strong> ${task.totalHoursSpent} hours</p>
          ${task.category ? `<p><strong>Category:</strong> ${task.category}</p>` : ''}
        </div>

        <p>You can review the task details and time tracking information in the system.</p>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This is an automated message from the Task Management System.
          </p>
        </div>
      </div>
    `;

    const text = `
      Task Completed: ${task.title}

      ${assignee.firstName} ${assignee.lastName} has completed the task assigned to them.

      Task Details:
      - Title: ${task.title}
      - Description: ${task.description}
      - Completed By: ${assignee.firstName} ${assignee.lastName}
      - Completed Date: ${new Date(task.completedDate).toLocaleDateString()}
      - Total Time Spent: ${task.totalHoursSpent} hours
      ${task.category ? `- Category: ${task.category}` : ''}

      You can review the task details and time tracking information in the system.
    `;

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
      text
    });
  }

  /**
   * Send task status update notification email
   * @param {string} recipientEmail - Recipient email (assigner)
   * @param {Object} task - Task object
   * @param {Object} assignee - User assigned to the task
   * @param {Object} updater - User who updated the status
   * @param {string} newStatus - New status value
   */
  async sendTaskStatusUpdateEmail(recipientEmail, task, assignee, updater, newStatus) {
    const subject = `Task Status Updated: ${task.title}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #007bff;">Task Status Updated</h2>
        <p>Hello,</p>
        <p><strong>${updater.firstName} ${updater.lastName}</strong> has updated the status of a task assigned to <strong>${assignee.firstName} ${assignee.lastName}</strong>.</p>

        <div style="background-color: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <h3 style="margin-top: 0; color: #333;">${task.title}</h3>
          <p><strong>Description:</strong> ${task.description}</p>
          <p><strong>Assigned To:</strong> ${assignee.firstName} ${assignee.lastName}</p>
          <p><strong>Updated By:</strong> ${updater.firstName} ${updater.lastName}</p>
          <p><strong>New Status:</strong> <span style="background-color: #007bff; color: white; padding: 2px 8px; border-radius: 3px; font-weight: bold;">${newStatus.replace('_', ' ').toUpperCase()}</span></p>
          <p><strong>Updated Date:</strong> ${new Date().toLocaleDateString()}</p>
          ${task.category ? `<p><strong>Category:</strong> ${task.category}</p>` : ''}
        </div>

        <p>You can review the task details and status history in the system.</p>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This is an automated message from the Task Management System.
          </p>
        </div>
      </div>
    `;

    const text = `
      Task Status Updated: ${task.title}

      ${updater.firstName} ${updater.lastName} has updated the status of a task assigned to ${assignee.firstName} ${assignee.lastName}.

      Task Details:
      - Title: ${task.title}
      - Description: ${task.description}
      - Assigned To: ${assignee.firstName} ${assignee.lastName}
      - Updated By: ${updater.firstName} ${updater.lastName}
      - New Status: ${newStatus.replace('_', ' ').toUpperCase()}
      - Updated Date: ${new Date().toLocaleDateString()}
      ${task.category ? `- Category: ${task.category}` : ''}

      You can review the task details and status history in the system.
    `;

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
      text
    });
  }

  /**
   * Send task overdue notification email
   * @param {string} recipientEmail - Recipient email
   * @param {Object} task - Task object
   * @param {Object} assignee - User assigned to the task
   */
  async sendTaskOverdueEmail(recipientEmail, task, assignee) {
    const subject = `⚠️ Task Overdue: ${task.title}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">Task Overdue</h2>
        <p>Hello,</p>
        <p>The following task is now overdue and requires immediate attention.</p>

        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <h3 style="margin-top: 0; color: #856404;">${task.title}</h3>
          <p><strong>Description:</strong> ${task.description}</p>
          <p><strong>Assigned To:</strong> ${assignee.firstName} ${assignee.lastName}</p>
          <p><strong>Due Date:</strong> ${new Date(task.dueDate).toLocaleDateString()}</p>
          <p><strong>Days Overdue:</strong> ${task.daysUntilDue} days</p>
          <p><strong>Priority:</strong> ${task.priority.toUpperCase()}</p>
          ${task.category ? `<p><strong>Category:</strong> ${task.category}</p>` : ''}
        </div>

        <p>Please take immediate action to address this overdue task.</p>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This is an automated message from the Task Management System.
          </p>
        </div>
      </div>
    `;

    const text = `
      ⚠️ Task Overdue: ${task.title}

      The following task is now overdue and requires immediate attention.

      Task Details:
      - Title: ${task.title}
      - Description: ${task.description}
      - Assigned To: ${assignee.firstName} ${assignee.lastName}
      - Due Date: ${new Date(task.dueDate).toLocaleDateString()}
      - Days Overdue: ${task.daysUntilDue} days
      - Priority: ${task.priority.toUpperCase()}
      ${task.category ? `- Category: ${task.category}` : ''}

      Please take immediate action to address this overdue task.
    `;

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
      text
    });
  }

  /**
   * Send welcome email to new user
   * @param {string} recipientEmail - Recipient email
   * @param {Object} user - New user object
   */
  async sendWelcomeEmail(recipientEmail, user) {
    const subject = `Welcome to ${process.env.APP_NAME || 'Task Management System'}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to Our Team!</h2>
        <p>Hello <strong>${user.firstName} ${user.lastName}</strong>,</p>
        <p>Welcome to the ${process.env.APP_NAME || 'Task Management System'}! Your account has been created successfully.</p>

        <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <p><strong>Employee ID:</strong> ${user.employeeId}</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Role:</strong> ${user.role}</p>
          <p><strong>Designation:</strong> ${user.designation}</p>
        </div>

        <p>You can now log in to your account and start managing your tasks.</p>
        <p>If you have any questions, please don't hesitate to contact your administrator.</p>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            This is an automated message from the Task Management System.
          </p>
        </div>
      </div>
    `;

    const text = `
      Welcome to ${process.env.APP_NAME || 'Task Management System'}!

      Hello ${user.firstName} ${user.lastName},

      Your account has been created successfully.

      Account Details:
      - Employee ID: ${user.employeeId}
      - Email: ${user.email}
      - Role: ${user.role}
      - Designation: ${user.designation}

      You can now log in to your account and start managing your tasks.

      If you have any questions, please contact your administrator.
    `;

    return this.sendEmail({
      to: recipientEmail,
      subject,
      html,
      text
    });
  }

  /**
   * Test email configuration
   * @param {string} testEmail - Email to send test to
   */
  async sendTestEmail(testEmail) {
    const subject = 'Email Configuration Test';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Email Configuration Test</h2>
        <p>This is a test email to verify your email configuration is working correctly.</p>
        <p>If you received this email, your SMTP settings are configured properly.</p>
        <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 12px;">
            Task Management System - Configuration Test
          </p>
        </div>
      </div>
    `;

    const text = `
      Email Configuration Test

      This is a test email to verify your email configuration is working correctly.

      If you received this email, your SMTP settings are configured properly.

      Sent at: ${new Date().toLocaleString()}
    `;

    return this.sendEmail({
      to: testEmail,
      subject,
      html,
      text
    });
  }
}

// Create singleton instance
const emailService = new EmailService();

export default emailService;