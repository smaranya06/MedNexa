const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mednexa');
    console.log(`[MongoDB Connected]: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`[MongoDB Connection Error]: ${error.message}`);
    // Don't kill process immediately in development so we can give informative error responses
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB Warning]: Disconnected from database');
});

mongoose.connection.on('reconnected', () => {
  console.log('[MongoDB]: Reconnected to database');
});

module.exports = connectDB;

