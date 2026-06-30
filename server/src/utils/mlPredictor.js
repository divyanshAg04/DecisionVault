import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

// Encoders and Scalers cached in memory
let placementModel = null;
let packageModel = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const datasetsDir = path.resolve(__dirname, '../../datasets');
const serverDir = path.resolve(__dirname, '../..');
const pythonPredictorPath = path.join(serverDir, 'predict_placement.py');
const pythonModelBundlePath = path.join(serverDir, 'models', 'placement_bundle.joblib');
const localWindowsPython = path.join(serverDir, '.venv', 'Scripts', 'python.exe');
const localUnixPython = path.join(serverDir, '.venv', 'bin', 'python');

const branchMap = { 'Mechanical': 0, 'Electrical': 1, 'DS': 2, 'CS': 3, 'IT': 4, 'AI': 5 };
const degreeMap = { 'BE': 0, 'BTech': 1, 'BCA': 2, 'BSc': 3 };
const genderMap = { 'Male': 1, 'Female': 0 };

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Sigmoid function for logistic regression
function sigmoid(z) {
  return 1 / (1 + Math.exp(-Math.max(-15, Math.min(15, z))));
}

function resolvePythonBin() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  if (fs.existsSync(localWindowsPython)) {
    return localWindowsPython;
  }

  if (fs.existsSync(localUnixPython)) {
    return localUnixPython;
  }

  return 'python';
}

function tryPythonPrediction(studentProfile) {
  if (!fs.existsSync(pythonPredictorPath) || !fs.existsSync(pythonModelBundlePath)) {
    return null;
  }

  const pythonBin = resolvePythonBin();
  const result = spawnSync(
    pythonBin,
    [pythonPredictorPath, JSON.stringify(studentProfile)],
    {
      cwd: serverDir,
      encoding: 'utf-8',
      timeout: 10000,
      windowsHide: true,
    },
  );

  if (result.error || result.status !== 0 || !result.stdout) {
    const reason = result.error?.message || result.stderr || result.stdout || 'unknown Python prediction error';
    console.warn(`[ML Predictor] Python model unavailable, using JS fallback: ${reason}`);
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout.trim());
    if (parsed.status === 'Success') {
      return parsed;
    }
    console.warn(`[ML Predictor] Python model returned non-success status: ${parsed.message || parsed.status}`);
    return null;
  } catch (err) {
    console.warn(`[ML Predictor] Failed to parse Python prediction output: ${err.message}`);
    return null;
  }
}

export function trainModels() {
  if (fs.existsSync(pythonModelBundlePath)) {
    console.log('[ML Predictor] Python/sklearn model bundle found. Skipping JS fallback training.');
    return;
  }

  const csvPath = path.join(datasetsDir, 'Indian_Student_Placement_Dataset_2025.csv');
  if (!fs.existsSync(csvPath)) {
    console.warn(`[ML Predictor] Placement dataset not found at ${csvPath}. Skipping ML training.`);
    return;
  }

  console.log('[ML Predictor] Loading student placement dataset...');
  const data = fs.readFileSync(csvPath, 'utf-8');
  const lines = data.split(/\r?\n/);
  const headers = parseCSVLine(lines[0]);
  
  const dataset = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = parseCSVLine(line);
    if (cols.length < headers.length) continue;
    
    // student_id,gender,age,degree,branch,cgpa,backlogs,internships,certifications,coding_skills,communication_skills,aptitude_score,projects,placed,company_type,package_lpa
    const gender = genderMap[cols[1]] !== undefined ? genderMap[cols[1]] : 0;
    const age = parseFloat(cols[2]) || 21;
    const degree = degreeMap[cols[3]] !== undefined ? degreeMap[cols[3]] : 1;
    const branch = branchMap[cols[4]] !== undefined ? branchMap[cols[4]] : 3;
    const cgpa = parseFloat(cols[5]) || 7.0;
    const backlogs = parseFloat(cols[6]) || 0;
    const internships = parseFloat(cols[7]) || 0;
    const certifications = parseFloat(cols[8]) || 0;
    const coding_skills = parseFloat(cols[9]) || 5;
    const communication_skills = parseFloat(cols[10]) || 5;
    const aptitude_score = parseFloat(cols[11]) || 50;
    const projects = parseFloat(cols[12]) || 0;
    const placed = parseInt(cols[13], 10) || 0;
    const package_lpa = parseFloat(cols[15]) || 0.0;
    
    dataset.push({
      features: [gender, age, degree, branch, cgpa, backlogs, internships, certifications, coding_skills, communication_skills, aptitude_score, projects],
      placed,
      package_lpa
    });
  }

  const numFeatures = 12;
  const numRows = dataset.length;
  if (numRows < 10) {
    console.warn(`[ML Predictor] Only ${numRows} usable rows found. Skipping ML training.`);
    return;
  }

  console.log(`[ML Predictor] Parsed ${numRows} student rows. Scaling features...`);

  // Calculate means and standard deviations for scaling (StandardScaler)
  const means = Array(numFeatures).fill(0);
  const stds = Array(numFeatures).fill(0);

  for (let j = 0; j < numFeatures; j++) {
    let sum = 0;
    for (let i = 0; i < numRows; i++) {
      sum += dataset[i].features[j];
    }
    means[j] = sum / numRows;

    let sqSum = 0;
    for (let i = 0; i < numRows; i++) {
      sqSum += Math.pow(dataset[i].features[j] - means[j], 2);
    }
    stds[j] = Math.sqrt(sqSum / numRows) || 1;
  }

  // Normalize features
  for (let i = 0; i < numRows; i++) {
    for (let j = 0; j < numFeatures; j++) {
      dataset[i].features[j] = (dataset[i].features[j] - means[j]) / stds[j];
    }
  }

  // Split into train/test (80/20)
  const trainSize = Math.floor(numRows * 0.8);
  const trainSet = dataset.slice(0, trainSize);
  const testSet = dataset.slice(trainSize);

  // 1. TRAIN LOGISTIC REGRESSION (Placement likelihood)
  console.log('[ML Predictor] Training Logistic Regression Classifier (Stochastic Gradient Descent)...');
  let weightsClf = Array(numFeatures).fill(0);
  let biasClf = 0;
  const lrClf = 0.05;
  const epochsClf = 100;

  for (let epoch = 0; epoch < epochsClf; epoch++) {
    for (let i = 0; i < trainSet.length; i++) {
      const x = trainSet[i].features;
      const y = trainSet[i].placed;
      
      let z = biasClf;
      for (let j = 0; j < numFeatures; j++) {
        z += x[j] * weightsClf[j];
      }
      const yPred = sigmoid(z);
      const err = yPred - y;
      
      // Update weights and bias
      biasClf -= lrClf * err;
      for (let j = 0; j < numFeatures; j++) {
        weightsClf[j] -= lrClf * err * x[j];
      }
    }
  }

  // Evaluate Classifier on Test Set
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = 0; i < testSet.length; i++) {
    const x = testSet[i].features;
    const y = testSet[i].placed;
    
    let z = biasClf;
    for (let j = 0; j < numFeatures; j++) {
      z += x[j] * weightsClf[j];
    }
    const prob = sigmoid(z);
    const pred = prob >= 0.5 ? 1 : 0;
    
    if (y === 1 && pred === 1) tp++;
    else if (y === 0 && pred === 0) tn++;
    else if (y === 0 && pred === 1) fp++;
    else if (y === 1 && pred === 0) fn++;
  }

  const accuracy = testSet.length ? (tp + tn) / testSet.length : 0;
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1 = (2 * precision * recall) / (precision + recall) || 0;

  console.log(`[ML Predictor] Placement Classifier Metrics (Test Set):`);
  console.log(`  --> Accuracy:  ${(accuracy * 100).toFixed(2)}%`);
  console.log(`  --> Precision: ${(precision * 100).toFixed(2)}%`);
  console.log(`  --> Recall:    ${(recall * 100).toFixed(2)}%`);
  console.log(`  --> F1-Score:  ${f1.toFixed(4)}`);

  placementModel = { weights: weightsClf, bias: biasClf, means, stds };

  // 2. TRAIN LINEAR REGRESSION (Package prediction for placed students only)
  console.log('[ML Predictor] Training Linear Regression Regressor (Gradient Descent)...');
  const placedTrainSet = trainSet.filter(row => row.placed === 1);
  const placedTestSet = testSet.filter(row => row.placed === 1);

  let weightsReg = Array(numFeatures).fill(0);
  let biasReg = placedTrainSet.length > 0 ? placedTrainSet.reduce((acc, row) => acc + row.package_lpa, 0) / placedTrainSet.length : 8.0;
  const lrReg = 0.01;
  const epochsReg = 100;

  for (let epoch = 0; epoch < epochsReg; epoch++) {
    for (let i = 0; i < placedTrainSet.length; i++) {
      const x = placedTrainSet[i].features;
      const y = placedTrainSet[i].package_lpa;
      
      let yPred = biasReg;
      for (let j = 0; j < numFeatures; j++) {
        yPred += x[j] * weightsReg[j];
      }
      const err = yPred - y;
      
      biasReg -= lrReg * err;
      for (let j = 0; j < numFeatures; j++) {
        weightsReg[j] -= lrReg * err * x[j];
      }
    }
  }

  // Evaluate Regressor on Placed Test Set
  let sumSqErr = 0;
  let sumSqTotal = 0;
  let absErrSum = 0;
  
  const yTestMean = placedTestSet.length
    ? placedTestSet.reduce((acc, row) => acc + row.package_lpa, 0) / placedTestSet.length
    : 1.0;

  for (let i = 0; i < placedTestSet.length; i++) {
    const x = placedTestSet[i].features;
    const y = placedTestSet[i].package_lpa;
    
    let yPred = biasReg;
    for (let j = 0; j < numFeatures; j++) {
      yPred += x[j] * weightsReg[j];
    }
    
    sumSqErr += Math.pow(y - yPred, 2);
    sumSqTotal += Math.pow(y - yTestMean, 2);
    absErrSum += Math.abs(y - yPred);
  }

  const r2Score = 1 - (sumSqErr / (sumSqTotal || 1));
  const mae = absErrSum / (placedTestSet.length || 1);

  console.log(`[ML Predictor] Package Regressor Metrics (Placed Test Set):`);
  console.log(`  --> R2 Score (R-squared): ${r2Score.toFixed(4)}`);
  console.log(`  --> Mean Absolute Error: ${mae.toFixed(2)} LPA`);

  packageModel = { weights: weightsReg, bias: biasReg };
}

// Inference function
export function predictPlacementAndPackage(studentProfile) {
  const pythonPrediction = tryPythonPrediction(studentProfile);
  if (pythonPrediction) {
    return pythonPrediction;
  }

  if (!placementModel || !packageModel) {
    return { placedProbability: 0.5, expectedPackageLpa: 0.0, status: 'Model not trained' };
  }

  const { weights: wC, bias: bC, means, stds } = placementModel;
  const { weights: wR, bias: bR } = packageModel;

  // Prepare input feature vector
  const gender = genderMap[studentProfile.gender] !== undefined ? genderMap[studentProfile.gender] : 1;
  const age = studentProfile.age || 21;
  const degree = degreeMap[studentProfile.degree] !== undefined ? degreeMap[studentProfile.degree] : 1;
  const branch = branchMap[studentProfile.branch] !== undefined ? branchMap[studentProfile.branch] : 3;
  const cgpa = studentProfile.cgpa || 7.5;
  const backlogs = studentProfile.backlogs || 0;
  const internships = studentProfile.internships || 0;
  const certifications = studentProfile.certifications || 0;
  const coding_skills = studentProfile.codingSkills || 5;
  const communication_skills = studentProfile.communicationSkills || 5;
  const aptitude_score = studentProfile.aptitudeScore || 70;
  const projects = studentProfile.projects || 0;

  const rawFeatures = [gender, age, degree, branch, cgpa, backlogs, internships, certifications, coding_skills, communication_skills, aptitude_score, projects];
  
  // Scale features
  const scaledFeatures = rawFeatures.map((val, idx) => (val - means[idx]) / stds[idx]);

  // Predict placement probability
  let zClf = bC;
  for (let j = 0; j < 12; j++) {
    zClf += scaledFeatures[j] * wC[j];
  }
  const prob = sigmoid(zClf);

  // Predict package
  let yPred = bR;
  for (let j = 0; j < 12; j++) {
    yPred += scaledFeatures[j] * wR[j];
  }

  // Constrain predicted package to realistic values
  const expectedPackageLpa = prob >= 0.35 ? Math.max(3.0, Math.min(45.0, yPred)) : 0.0;

  return {
    placedProbability: prob,
    expectedPackageLpa: Math.round(expectedPackageLpa * 100) / 100,
    status: 'Success'
  };
}
