import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { connectDb } from '../config/db.js';
import { Cutoff } from '../models/Cutoff.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvPath = path.resolve(__dirname, '../../datasets/2024_Round_1.csv');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.replace(/^"|"$/g, '').trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^"|"$/g, '').trim());
  return result;
}

async function runSeeder() {
  try {
    console.log('Connecting to MongoDB...');
    await connectDb(process.env.MONGO_URI);
    
    console.log('Clearing existing cutoffs...');
    await Cutoff.deleteMany({});
    
    console.log(`Reading CSV from ${csvPath}...`);
    const data = fs.readFileSync(csvPath, 'utf-8');
    const lines = data.split(/\r?\n/);
    
    const cutoffs = [];
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const columns = parseCSVLine(line);
      if (columns.length < 7) continue;
      
      const [institute, program, quota, seatType, gender, openRankStr, closeRankStr] = columns;
      
      // Clean and parse ranks (JEE ranks can sometimes have P suffix for prep list)
      const openingRank = parseInt(openRankStr.replace(/[^0-9]/g, ''), 10);
      const closingRank = parseInt(closeRankStr.replace(/[^0-9]/g, ''), 10);
      
      if (isNaN(openingRank) || isNaN(closingRank)) continue;
      
      cutoffs.push({
        institute,
        program,
        quota,
        seatType,
        gender,
        openingRank,
        closingRank
      });
    }
    
    console.log(`Parsed ${cutoffs.length} valid cutoffs. Seeding to database...`);
    
    // Batch insert for performance
    const batchSize = 1000;
    for (let i = 0; i < cutoffs.length; i += batchSize) {
      const batch = cutoffs.slice(i, i + batchSize);
      await Cutoff.insertMany(batch);
      console.log(`Seeded ${i + batch.length}/${cutoffs.length} rows...`);
    }
    
    console.log('Cutoff data seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error during cutoff seeding:', err);
    process.exit(1);
  }
}

runSeeder();
