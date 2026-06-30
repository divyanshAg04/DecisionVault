import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const datasetsDir = path.resolve(__dirname, 'datasets');
if (!fs.existsSync(datasetsDir)) {
  fs.mkdirSync(datasetsDir, { recursive: true });
}

const files = [
  {
    name: '2024_Round_1.csv',
    id: '1tsCQoPPUYeXzy7Gq9v7-4tlm3-NRhgql'
  },
  {
    name: 'Indian_Student_Placement_Dataset_2025.csv',
    id: '1IJ3E9f_xxkBYtwWt4IGJOxPuJDNMBYdG'
  },
  {
    name: 'merged_jee_cutoff_2018_2025.csv',
    id: '10xVwzCtdKhIxKX1xf_JJNuRLkcuk9uvK'
  }
];

function downloadLargeDriveFile(fileId, destPath) {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/uc?export=download&id=${fileId}`;
    
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301 || res.statusCode === 303) {
        const redirectUrl = res.headers.location;
        https.get(redirectUrl, (redRes) => {
          handleResponse(redRes, fileId, destPath, resolve, reject);
        }).on('error', reject);
      } else {
        handleResponse(res, fileId, destPath, resolve, reject);
      }
    }).on('error', reject);
  });
}

function handleResponse(res, fileId, destPath, resolve, reject) {
  const contentType = res.headers['content-type'] || '';
  
  if (contentType.includes('text/html')) {
    let body = '';
    res.on('data', chunk => { body += chunk; });
    res.on('end', () => {
      const match = body.match(/confirm=([a-zA-Z0-9_\-]+)/);
      if (match && match[1]) {
        const token = match[1];
        console.log(`Found confirmation token: ${token}`);
        const downloadUrl = `https://docs.google.com/uc?export=download&confirm=${token}&id=${fileId}`;
        
        https.get(downloadUrl, (confirmRes) => {
          if (confirmRes.statusCode === 302 || confirmRes.statusCode === 301 || confirmRes.statusCode === 303) {
            const redirectUrl = confirmRes.headers.location;
            https.get(redirectUrl, (finalRes) => {
              saveStream(finalRes, destPath, resolve, reject);
            }).on('error', reject);
          } else {
            saveStream(confirmRes, destPath, resolve, reject);
          }
        }).on('error', reject);
      } else {
        reject(new Error(`Failed to find confirmation token in Google Drive response HTML`));
      }
    });
  } else {
    saveStream(res, destPath, resolve, reject);
  }
}

function saveStream(res, destPath, resolve, reject) {
  if (res.statusCode !== 200) {
    reject(new Error(`Failed to download: Status Code ${res.statusCode}`));
    return;
  }
  const fileStream = fs.createWriteStream(destPath);
  res.pipe(fileStream);
  fileStream.on('finish', () => {
    fileStream.close();
    console.log(`Saved successfully to ${destPath}`);
    resolve();
  });
  fileStream.on('error', reject);
}

async function run() {
  for (const file of files) {
    console.log(`Starting download for ${file.name}...`);
    try {
      await downloadLargeDriveFile(file.id, path.join(datasetsDir, file.name));
    } catch (err) {
      console.error(`Error downloading ${file.name}: ${err.message}`);
    }
  }
  console.log('Done.');
}

run();
