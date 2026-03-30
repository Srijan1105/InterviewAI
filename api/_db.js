const mongoose = require('mongoose');

let cached = global._mongoConn;

async function connectDB() {
  if (cached && mongoose.connection.readyState === 1) return cached;
  cached = await mongoose.connect(process.env.MONGODB_URI);
  global._mongoConn = cached;
  return cached;
}

module.exports = connectDB;
