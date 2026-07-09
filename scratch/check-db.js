import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Contract } from '../DB/models/Contract.Model.js';
import { Audit } from '../DB/models/Audit.Model.js';

dotenv.config({ path: '../.env' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const contracts = await Contract.countDocuments();
  const audits = await Audit.countDocuments();
  console.log(`Contracts: ${contracts}`);
  console.log(`Audits: ${audits}`);
  process.exit(0);
}
check();
