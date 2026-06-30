import mongoose from 'mongoose';

export async function connectDb(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }

  mongoose.set('strictQuery', true);
  try {
    console.log(`Connecting to MongoDB: ${uri.replace(/:[^@/]+@/, ':****@')}`);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    return mongoose.connection;
  } catch (error) {
    const fallbackUri = 'mongodb://127.0.0.1:27017/decisionvault';
    if (uri === fallbackUri) {
      throw error;
    }
    console.warn(`\n[WARNING] Failed to connect to primary database: ${error.message}`);
    console.warn(`Attempting fallback to local MongoDB: ${fallbackUri}\n`);
    try {
      await mongoose.connect(fallbackUri, { serverSelectionTimeoutMS: 5000 });
      console.log('Successfully connected to fallback local MongoDB database.');
      return mongoose.connection;
    } catch (fallbackError) {
      console.error('Fallback connection failed as well.');
      throw error;
    }
  }
}
