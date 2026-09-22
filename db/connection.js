// db/connection.js
// MongoDB via Mongoose. No manual database/collection setup required —
// connecting to a MongoDB URI is enough; every collection in models/ is
// created automatically (by Mongoose, i.e. by code) the first time a
// document is saved to it.
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/MinhasPA';

let connectionPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  mongoose.set('strictQuery', true);

  connectionPromise = mongoose
    .connect(uri, {
      // Keep this app usable even if Mongo isn't reachable yet at boot —
      // requests will just fail until it connects, instead of crashing
      // the whole process.
      serverSelectionTimeoutMS: 8000,
    })
    .then((conn) => {
      console.log(`Connected to MongoDB: ${conn.connection.name}`);
      return conn.connection;
    })
    .catch((err) => {
      connectionPromise = null; // allow a retry on the next call
      throw err;
    });

  return connectionPromise;
}

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

module.exports = { mongoose, connectDB };
