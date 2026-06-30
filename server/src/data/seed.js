import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { connectDb } from '../config/db.js';
import { College } from '../models/College.js';
import { Decision } from '../models/Decision.js';
import { Reflection } from '../models/Reflection.js';
import { Shortlist } from '../models/Shortlist.js';
import { User } from '../models/User.js';

dotenv.config();

const colleges = [
  {
    name: 'IIIT Lucknow',
    shortName: 'IIITL',
    type: 'Institute of National Importance',
    branch: 'Computer Science',
    state: 'Uttar Pradesh',
    city: 'Lucknow',
    fees: 92000,
    avgPackage: 30.5,
    medianPackage: 25.0,
    placementRate: 96,
    nirfRank: 90,
    hostel: true,
    cutoff: 8900,
    distanceKm: 425,
    campusLife: 7.1,
    faculty: 8.0,
    research: 6.8,
    roi: 9.4,
    tags: ['coding culture', 'high ROI', 'small campus'],
    pros: ['Strong coding culture', 'High average package', 'Fast-growing alumni network'],
    cons: ['Compact campus', 'Limited extracurricular diversity', 'Competitive workload'],
    researchLinks: [
      { label: 'Official admissions page', type: 'Official', url: 'https://iiitl.ac.in/' },
      { label: 'Placement report review', type: 'Placement PDF', url: 'https://iiitl.ac.in/' },
    ],
  },
  {
    name: 'Delhi Technological University',
    shortName: 'DTU',
    type: 'State Technical University',
    branch: 'Computer Engineering',
    state: 'Delhi',
    city: 'New Delhi',
    fees: 229000,
    avgPackage: 16.3,
    medianPackage: 13.2,
    placementRate: 91,
    nirfRank: 29,
    hostel: true,
    cutoff: 7100,
    distanceKm: 35,
    campusLife: 9.2,
    faculty: 8.3,
    research: 7.7,
    roi: 7.7,
    tags: ['brand value', 'Delhi network', 'large campus'],
    pros: ['Strong alumni network', 'Excellent campus life', 'Good Delhi startup access'],
    cons: ['Higher fee than some alternatives', 'Large batch size', 'Hostel not guaranteed for all'],
    researchLinks: [
      { label: 'Official website', type: 'Official', url: 'https://dtu.ac.in/' },
      { label: 'Placement cell', type: 'Placement PDF', url: 'https://dtu.ac.in/' },
    ],
  },
  {
    name: 'Netaji Subhas University of Technology',
    shortName: 'NSUT',
    type: 'State Technical University',
    branch: 'Computer Science',
    state: 'Delhi',
    city: 'New Delhi',
    fees: 244000,
    avgPackage: 17.7,
    medianPackage: 14.8,
    placementRate: 93,
    nirfRank: 57,
    hostel: true,
    cutoff: 7600,
    distanceKm: 52,
    campusLife: 8.5,
    faculty: 8.1,
    research: 7.5,
    roi: 7.9,
    tags: ['placements', 'Delhi location', 'tech societies'],
    pros: ['Good placements', 'Balanced academics and societies', 'Strong location advantage'],
    cons: ['Fee is significant', 'Commute can matter', 'Competitive branch allocation'],
    researchLinks: [
      { label: 'Official website', type: 'Official', url: 'https://nsut.ac.in/' },
      { label: 'Placement stats', type: 'Placement PDF', url: 'https://nsut.ac.in/' },
    ],
  },
  {
    name: 'National Institute of Technology Delhi',
    shortName: 'NITD',
    type: 'NIT',
    branch: 'Computer Science',
    state: 'Delhi',
    city: 'New Delhi',
    fees: 151000,
    avgPackage: 15.6,
    medianPackage: 12.6,
    placementRate: 89,
    nirfRank: 51,
    hostel: true,
    cutoff: 10600,
    distanceKm: 62,
    campusLife: 7.4,
    faculty: 7.8,
    research: 7.2,
    roi: 8.5,
    tags: ['NIT tag', 'Delhi', 'growing campus'],
    pros: ['NIT brand', 'Good ROI', 'Delhi NCR exposure'],
    cons: ['Newer reputation than top NITs', 'Infrastructure still growing', 'Smaller alumni base'],
    researchLinks: [
      { label: 'Official website', type: 'Official', url: 'https://nitdelhi.ac.in/' },
      { label: 'Admissions brochure', type: 'Official', url: 'https://nitdelhi.ac.in/' },
    ],
  },
  {
    name: 'Aligarh Muslim University',
    shortName: 'AMU',
    type: 'Central University',
    branch: 'Computer Engineering',
    state: 'Uttar Pradesh',
    city: 'Aligarh',
    fees: 18000,
    avgPackage: 7.5,
    medianPackage: 6.2,
    placementRate: 73,
    nirfRank: 32,
    hostel: true,
    cutoff: 14800,
    distanceKm: 130,
    campusLife: 8.3,
    faculty: 7.9,
    research: 7.1,
    roi: 8.8,
    tags: ['affordable', 'central university', 'near home'],
    pros: ['Very affordable', 'Recognized university', 'Good hostel ecosystem'],
    cons: ['Lower tech placement ceiling', 'Needs stronger self-driven coding effort', 'Less startup exposure'],
    researchLinks: [
      { label: 'Official website', type: 'Official', url: 'https://amu.ac.in/' },
      { label: 'Engineering faculty page', type: 'Official', url: 'https://amu.ac.in/' },
    ],
  },
];

async function seed() {
  await connectDb(process.env.MONGO_URI);

  await Promise.all([
    College.deleteMany({}),
    User.deleteMany({ email: 'demo@decisionvault.dev' }),
    Shortlist.deleteMany({}),
    Decision.deleteMany({}),
    Reflection.deleteMany({}),
  ]);

  const createdColleges = await College.insertMany(colleges);
  const passwordHash = await bcrypt.hash('Password123', 12);
  const user = await User.create({
    name: 'Demo Student',
    email: 'demo@decisionvault.dev',
    passwordHash,
    examTrack: 'JEE',
    targetYear: 2027,
    journey: 'Entrance result ready',
    exam: 'JEE Main',
    scoreType: 'Rank',
    score: '8900',
    category: 'General',
    homeState: 'Uttar Pradesh',
    preferredBranches: 'Computer Science, Computer Engineering',
  });

  const prioritySet = [
    { key: 'avgPackage', label: 'Placements', weight: 5 },
    { key: 'roi', label: 'ROI', weight: 5 },
    { key: 'fees', label: 'Fees', weight: 3 },
    { key: 'campusLife', label: 'Campus Life', weight: 3 },
    { key: 'research', label: 'Research', weight: 2 },
    { key: 'distanceKm', label: 'Distance', weight: 4 },
  ];

  await Shortlist.insertMany(
    createdColleges.slice(0, 3).map((college, index) => ({
      user: user._id,
      college: college._id,
      confidence: [84, 78, 80][index],
      priorities: prioritySet,
      pros: college.pros,
      cons: college.cons,
      notes: [
        {
          body: `${college.shortName} is shortlisted because it has a strong fit with the current priority set.`,
          source: 'Demo research note',
        },
      ],
    })),
  );

  console.log('Seeded DecisionVault demo data');
  console.log('Demo login: demo@decisionvault.dev / Password123');
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
