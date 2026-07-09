import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const contractSchema = new mongoose.Schema({
  title: String,
  exposureScore: Number,
  exposureReport: String,
  status: String,
  createdAt: Date
});

const Contract = mongoose.model('Contract', contractSchema);

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  const contracts = await Contract.find().sort({ createdAt: -1 }).limit(3);
  for (const c of contracts) {
    console.log(`Contract: ${c.title}`);
    console.log(`Score: ${c.exposureScore}`);
    console.log(`Report: ${c.exposureReport ? 'YES (' + c.exposureReport.length + ' chars)' : 'NO'}`);
    console.log(`Status: ${c.status}`);
    console.log('---');
  }
  process.exit(0);
}
check();
