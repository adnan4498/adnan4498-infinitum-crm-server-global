import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Database Configuration Class
 * Handles MongoDB connection with proper error handling and options
 */
class Database {
  constructor() {
    this.connectionString = process.env.MONGODB_URL;
    this.options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    };
  }

  /**
   * Connect to MongoDB database
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      // Event listeners for connection monitoring
      mongoose.connection.on('connected', () => {
        console.log('✅ MongoDB connected successfully');
      });

      mongoose.connection.on('error', (error) => {
        console.error('❌ MongoDB connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️  MongoDB disconnected');
      });

      // Handle application termination
      process.on('SIGINT', this.gracefulShutdown);
      process.on('SIGTERM', this.gracefulShutdown);

      await mongoose.connect(this.connectionString, this.options);
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error);
      process.exit(1);
    }
  }

  /**
   * Gracefully close database connection
   */
  async gracefulShutdown() {
    try {
      await mongoose.connection.close();
      console.log('📤 MongoDB connection closed through app termination');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during database shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Check database connection status
   * @returns {boolean}
   */
  isConnected() {
    return mongoose.connection.readyState === 1;
  }
}

export default new Database();
