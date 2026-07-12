import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { College } from '../models/College.js';
import { Cutoff } from '../models/Cutoff.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvPath = path.resolve(__dirname, '../../datasets/nirf_engineering_rankings.csv');

// Support dry-run CLI argument
const isDryRun = process.argv.includes('--dry-run');

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

// Programmatic helper to generate shortName
function generateShortName(name) {
  const commonAbbreviations = {
    'Delhi Technological University': 'DTU',
    'Netaji Subhas University of Technology': 'NSUT',
    'National Institute of Technology': 'NIT',
    'Indian Institute of Technology': 'IIT',
    'Indian Institute of Information Technology': 'IIIT',
    'Birla Institute of Technology and Science': 'BITS',
  };

  for (const [key, value] of Object.entries(commonAbbreviations)) {
    if (name.includes(key)) {
      const suffix = name.replace(key, '').trim();
      const suffixInitials = suffix.split(/\s+/).map(w => w[0]).join('');
      return `${value}${suffixInitials}`;
    }
  }

  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase();
}

// Programmatic helper to guess type
function guessType(name) {
  if (name.includes('Indian Institute of Technology')) return 'IIT';
  if (name.includes('National Institute of Technology')) return 'NIT';
  if (name.includes('Indian Institute of Information Technology')) return 'IIIT';
  if (name.includes('Birla Institute of Technology')) return 'BITS';
  if (name.includes('University')) return 'University';
  return 'Engineering College';
}

// IIT Configuration table to resolve correct database keys and normalize shortNames
const iitConfig = {
  'indian institute of technology madras': { dbKey: 'iitm', shortName: 'IITM' },
  'indian institute of technology delhi': { dbKey: 'iitd', shortName: 'IITD' },
  'indian institute of technology bombay': { dbKey: 'iitb', shortName: 'IITB' },
  'indian institute of technology kanpur': { dbKey: 'iitk', shortName: 'IITK' },
  'indian institute of technology kharagpur': { dbKey: 'iitkgp', shortName: 'IITKGP' },
  'indian institute of technology roorkee': { dbKey: 'iitr', shortName: 'IITR' },
  'indian institute of technology guwahati': { dbKey: 'iitg', shortName: 'IITG' },
  'indian institute of technology hyderabad': { dbKey: 'iith', shortName: 'IITH' },
  'indian institute of technology (banaras hindu university) varanasi': { dbKey: 'iiot(v', shortName: 'IIT (BHU)' },
  'indian institute of technology (banaras hindu university), varanasi': { dbKey: 'iiot(v', shortName: 'IIT (BHU)' },
  'indian institute of technology (bhu) varanasi': { dbKey: 'iiot(v', shortName: 'IIT (BHU)' },
  'indian institute of technology indore': { dbKey: 'iiti', shortName: 'IITI' },
  'indian institute of technology ropar': { dbKey: 'iitrpr', shortName: 'IIT Ropar' },
  'indian institute of technology gandhinagar': { dbKey: 'iiotg', shortName: 'IIT Gandhinagar' },
  'indian institute of technology patna': { dbKey: 'iiotp', shortName: 'IIT Patna' },
  'indian institute of technology jodhpur': { dbKey: 'iiotj', shortName: 'IIT Jodhpur' },
  'indian institute of technology tirupati': { dbKey: 'iiott', shortName: 'IIT Tirupati' },
  'indian institute of technology dharwad': { dbKey: 'iiotd', shortName: 'IIT Dharwad' },
  'indian institute of technology (indian school of mines) dhanbad': { dbKey: 'iiot(d', shortName: 'IIT (ISM) Dhanbad' },
  'indian institute of technology bhubaneswar': { dbKey: 'iiotb', shortName: 'IIT Bhubaneswar' },
  'indian institute of technology bhilai': { dbKey: 'iiotb', shortName: 'IIT Bhilai' },
  'indian institute of technology mandi': { dbKey: 'iitmandi', shortName: 'IIT Mandi' },
};

// Manual name mapping overrides for other colleges
const nameMapping = {
  'national institute of technology tiruchirappalli': 'National Institute of Technology Trichy',
  'netaji subhas university of technology (nsut)': 'Netaji Subhas University of Technology',
  'birla institute of technology and science -pilani': 'Birla Institute of Technology and Science, Pilani',
  'birla institute of technology & science, pilani': 'Birla Institute of Technology and Science, Pilani',
  'birla institute of technology and science, pilani': 'Birla Institute of Technology and Science, Pilani',
  'birla institute of technology and science pilani': 'Birla Institute of Technology and Science, Pilani',
  's.r.m. institute of science and technology': 'SRM Institute of Science and Technology',
  'srm institute of science and technology': 'SRM Institute of Science and Technology',
  'national institute of technology karnataka surathkal': 'National Institute of Technology Surathkal',
  'national institute of technology karnataka, surathkal': 'National Institute of Technology Surathkal',
  'birla institute of technology': 'Birla Institute of Technology, Mesra',
  'anna university': 'College of Engineering Guindy, Anna University',
};

// Robust helper to resolve existing college references
function findExistingCollege(name, dbCollegesMap) {
  const cleanName = name.toLowerCase().trim();

  // 1. Direct IIT Config lookup
  if (iitConfig[cleanName]) {
    const { dbKey } = iitConfig[cleanName];
    if (dbCollegesMap.has(dbKey)) {
      return dbCollegesMap.get(dbKey);
    }
  }

  // 2. Direct manual override mapping
  if (nameMapping[cleanName]) {
    const mappedName = nameMapping[cleanName].toLowerCase().trim();
    if (dbCollegesMap.has(mappedName)) {
      return dbCollegesMap.get(mappedName);
    }
  }

  // 3. Direct exact name lookup
  if (dbCollegesMap.has(cleanName)) {
    return dbCollegesMap.get(cleanName);
  }

  return null;
}

async function runSeeder() {
  try {
    if (isDryRun) {
      console.log('=== DRY RUN MODE: No database changes will be written ===');
    }

    console.log('Connecting to MongoDB...');
    await connectDb(process.env.MONGO_URI);

    if (!fs.existsSync(csvPath)) {
      console.error(`Error: CSV file not found at ${csvPath}`);
      process.exit(1);
    }

    console.log(`Reading CSV from ${csvPath}...`);
    const data = fs.readFileSync(csvPath, 'utf-8');
    const lines = data.split(/\r?\n/).filter(line => line.trim());

    if (lines.length <= 1) {
      console.log('CSV contains header only. No data to import.');
      process.exit(0);
    }

    // Parse header and data
    const headers = parseCSVLine(lines[0]);
    const rawColleges = [];

    for (let i = 1; i < lines.length; i++) {
      const columns = parseCSVLine(lines[i]);
      if (columns.length < headers.length) continue;
      
      const record = {};
      headers.forEach((h, idx) => {
        record[h] = columns[idx];
      });
      rawColleges.push(record);
    }

    console.log(`Parsed ${rawColleges.length} rows from CSV.`);

    // Extract Min/Max for Min-Max normalization
    const tlrScores = rawColleges.map(c => parseFloat(c.TLR_Score)).filter(s => !isNaN(s));
    const rpcScores = rawColleges.map(c => parseFloat(c.RPC_Score)).filter(s => !isNaN(s));

    const minTlr = tlrScores.length ? Math.min(...tlrScores) : 0;
    const maxTlr = tlrScores.length ? Math.max(...tlrScores) : 100;
    const minRpc = rpcScores.length ? Math.min(...rpcScores) : 0;
    const maxRpc = rpcScores.length ? Math.max(...rpcScores) : 100;

    // Fetch existing colleges to perform merges/updates
    const dbColleges = await College.find({});
    const dbCollegesMap = new Map();
    dbColleges.forEach(c => {
      dbCollegesMap.set(c.name.toLowerCase().trim(), c);
      dbCollegesMap.set(c.shortName.toLowerCase().trim(), c);
    });

    let updatedCount = 0;
    let insertedCount = 0;

    const dryRunReport = [];

    for (const raw of rawColleges) {
      const name = raw['Institute Name'].trim();
      const cleanName = name.toLowerCase().trim();
      const rank = parseInt(raw.Rank, 10);
      const city = raw.City;
      const state = raw.State;
      const tlr = parseFloat(raw.TLR_Score) || 0;
      const rpc = parseFloat(raw.RPC_Score) || 0;
      
      // Handle TBD gracefully for fees, placement and salary
      const isTbd = (val) => !val || val.trim().toUpperCase() === 'TBD';
      
      const fees = isTbd(raw.Annual_Fee) ? null : (parseInt(raw.Annual_Fee, 10) || null);
      const medianSalary = isTbd(raw.Median_Salary_LPA) ? null : (parseFloat(raw.Median_Salary_LPA) || null);
      const placementRate = isTbd(raw.Placement_Rate) ? null : (parseFloat(raw.Placement_Rate) || null);

      // Check if college already exists in DB using robust matching helper
      const collegeDoc = findExistingCollege(name, dbCollegesMap);

      // Merge and resolve final metrics using values or previous seed data
      const finalFees = fees ?? collegeDoc?.fees ?? null;
      const finalAvgPackage = medianSalary ?? collegeDoc?.avgPackage ?? null;
      const finalMedianPackage = medianSalary ?? collegeDoc?.medianPackage ?? null;
      const finalPlacementRate = placementRate ?? collegeDoc?.placementRate ?? null;

      // Min-Max scaling for faculty and research:
      // Rating = 1 + 9 * (Score - MinScore) / (MaxScore - MinScore)
      const facultyRating = maxTlr > minTlr ? 1 + 9 * ((tlr - minTlr) / (maxTlr - minTlr)) : 5;
      const researchRating = maxRpc > minRpc ? 1 + 9 * ((rpc - minRpc) / (maxRpc - minRpc)) : 5;
      
      // Calculate ROI dynamically using final resolved values
      let roi = null;
      if (finalFees && finalMedianPackage && finalFees > 0) {
        const rawRoi = (finalMedianPackage * 100000) / finalFees;
        const scaledRoi = Math.min(10, Math.max(1, rawRoi * 10)); 
        roi = Math.round(scaledRoi * 10) / 10;
      }

      // Campus Life: blend of Perception (PR) and Outreach (OI)
      const pr = parseFloat(raw.PR_Score) || 50;
      const oi = parseFloat(raw.OI_Score) || 50;
      const campusLifeRating = 1 + 9 * (((pr + oi) / 2) / 100);

      // Cutoff: lookup in real Cutoffs database if seeded, otherwise null
      let cutoff = null;
      try {
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cutoffDoc = await mongoose.model('Cutoff').findOne({
          institute: new RegExp(escapedName, 'i'),
          program: /computer|information|software/i,
          quota: 'AI',
          seatType: 'OPEN',
          gender: 'Gender-Neutral'
        }).sort({ year: -1, round: -1 });
        if (cutoffDoc && typeof cutoffDoc.closingRank === 'number') {
          cutoff = cutoffDoc.closingRank;
        }
      } catch (err) {
        console.warn(`[Seeder] Cutoff collection query failed for ${name}: ${err.message}`);
      }

      // Overwrite shortName to clean assignment if provided by iitConfig
      const finalShortName = iitConfig[cleanName]?.shortName || collegeDoc?.shortName || generateShortName(name);

      const updateData = {
        name,
        shortName: finalShortName,
        type: collegeDoc?.type || guessType(name),
        branch: collegeDoc?.branch || 'Computer Science',
        state,
        city,
        fees: finalFees,
        avgPackage: finalAvgPackage,
        medianPackage: finalMedianPackage,
        placementRate: finalPlacementRate,
        nirfRank: rank,
        hostel: collegeDoc?.hostel ?? true,
        cutoff: cutoff || collegeDoc?.cutoff || null,
        distanceKm: collegeDoc?.distanceKm ?? 200,
        campusLife: Math.round(campusLifeRating * 10) / 10,
        faculty: Math.round(facultyRating * 10) / 10,
        research: Math.round(researchRating * 10) / 10,
        roi,
        tags: collegeDoc?.tags || [guessType(name), 'NIRF Top 50'],
        pros: collegeDoc?.pros || ['High academic reputation', 'Qualified faculty pool'],
        cons: collegeDoc?.cons || ['Competitive curriculum'],
        researchLinks: collegeDoc?.researchLinks || [],
        admissionChannel: collegeDoc?.admissionChannel || 'Unknown — verify',
        source: 'NIRF 2024',
        lastVerifiedAt: new Date()
      };

      if (collegeDoc) {
        dryRunReport.push({ rank, name, action: 'UPDATE', matchedOn: `${collegeDoc.name} (${collegeDoc.shortName})` });
        if (!isDryRun) {
          await College.findByIdAndUpdate(collegeDoc._id, updateData);
        }
        updatedCount++;
      } else {
        dryRunReport.push({ rank, name, action: 'INSERT', matchedOn: 'None (New)' });
        if (!isDryRun) {
          await College.create(updateData);
        }
        insertedCount++;
      }
    }

    // Print Dry Run report
    console.log('\n=== INGESTION DRY-RUN REPORT ===');
    dryRunReport.forEach(r => {
      console.log(`Rank ${r.rank.toString().padStart(2, ' ')} | CSV Name: "${r.name}" -> Action: ${r.action.padEnd(6, ' ')} | Matched DB: ${r.matchedOn}`);
    });
    console.log('================================\n');

    if (isDryRun) {
      console.log(`Dry-run simulation completed. Updates matching: ${updatedCount}, Inserts as new: ${insertedCount}`);
      process.exit(0);
    }

    console.log(`Seeding completed. Updated: ${updatedCount}, Inserted: ${insertedCount}`);
    
    // Mark rest of the existing colleges that were not updated as "demo/placeholder"
    const finalColleges = await College.find({});
    let demoCount = 0;
    for (const c of finalColleges) {
      if (c.source !== 'NIRF 2024') {
        c.source = 'demo/placeholder';
        await c.save();
        demoCount++;
      }
    }
    console.log(`Flagged ${demoCount} other colleges as 'demo/placeholder'.`);
    process.exit(0);
  } catch (err) {
    console.error('Error running seeder:', err);
    process.exit(1);
  }
}

runSeeder();
