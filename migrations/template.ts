import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

export async function up(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI must be set in the environment');
  }
  await mongoose.connect(mongoUri);
}
