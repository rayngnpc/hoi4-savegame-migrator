const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const validator = require('../validator');

console.log('=== HOI4 Save Games Smoke Test & Validator ===\n');

// 1. Detect saves directory
function detectSavesDir() {
    // Try standard Windows Documents folder
    const documents = path.join(os.homedir(), 'Documents');
    const pathsToTry = [
        path.join(documents, 'Paradox Interactive', 'Hearts of Iron IV', 'save games'),
        path.join(documents, 'Paradox Interactive', 'Hearts of Iron IV', 'savegames')
    ];

    for (const p of pathsToTry) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return '';
}

// 2. Get Rakaly binary path
function getRakalyBinary() {
    const baseDir = path.join(__dirname, '..');
    let binaryName = '';
    if (process.platform === 'win32') {
        binaryName = 'rakaly-win.exe';
    } else if (process.platform === 'darwin') {
        binaryName = os.arch() === 'arm64' ? 'rakaly-mac-arm64' : 'rakaly-mac-x64';
    } else {
        binaryName = 'rakaly-linux';
    }
    const binaryPath = path.join(baseDir, 'bin', binaryName);
    return fs.existsSync(binaryPath) ? binaryPath : null;
}

const saveDir = detectSavesDir();
const rakalyPath = getRakalyBinary();

if (!saveDir) {
    console.error('ERROR: Could not detect Hearts of Iron IV save games directory.');
    process.exit(1);
}
console.log(`Detected Save Games Directory: ${saveDir}`);
console.log(`Rakaly Binary: ${rakalyPath || 'Not Found'}\n`);

// 3. Scan files
const files = fs.readdirSync(saveDir).filter(f => f.endsWith('.hoi4') && !f.endsWith('_melted.hoi4'));
if (files.length === 0) {
    console.log('No save files found.');
    process.exit(0);
}

console.log(`Found ${files.length} save files. Starting validation...\n`);

async function validateFile(filename) {
    const filepath = path.join(saveDir, filename);
    const stats = fs.statSync(filepath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    
    // Check if binary
    const buffer = Buffer.alloc(7);
    let fd;
    try {
        fd = fs.openSync(filepath, 'r');
        fs.readSync(fd, buffer, 0, 7, 0);
    } catch (e) {
        return { filename, size_mb: sizeMb, is_binary: false, status: 'ERROR', error: 'Failed to read file header: ' + e.message };
    } finally {
        if (fd) fs.closeSync(fd);
    }
    
    const isBinary = buffer.toString() === 'HOI4bin';
    let content = '';
    let tempMeltPath = '';
    
    try {
        if (isBinary) {
            if (!rakalyPath) {
                return { filename, size_mb: sizeMb, is_binary: true, status: 'SKIPPED', error: 'Rakaly binary missing (needed to melt binary save)' };
            }
            tempMeltPath = path.join(saveDir, `${path.basename(filename, '.hoi4')}_smoke_melt_tmp.hoi4`);
            const defaultMeltPath = path.join(saveDir, `${path.basename(filename, '.hoi4')}_melted.hoi4`);
            
            // Execute melt
            await new Promise((resolve, reject) => {
                execFile(rakalyPath, ['melt', '--unknown-key', 'stringify', filepath], (error, stdout, stderr) => {
                    if (fs.existsSync(defaultMeltPath) || (error && stderr.includes('already plaintext'))) {
                        resolve();
                    } else if (error) {
                        reject(new Error(stderr || error.message || stdout));
                    } else {
                        resolve();
                    }
                });
            });
            
            if (fs.existsSync(defaultMeltPath)) {
                fs.renameSync(defaultMeltPath, tempMeltPath);
            }
            
            content = fs.readFileSync(tempMeltPath, 'utf8');
            if (fs.existsSync(tempMeltPath)) {
                fs.unlinkSync(tempMeltPath);
            }
        } else {
            content = fs.readFileSync(filepath, 'utf8');
        }
        
        // Run validation
        const valResult = validator.validatePreMigration(content);
        if (valResult.valid) {
            return { filename, size_mb: sizeMb, is_binary: isBinary, status: 'PASSED', states: valResult.stateCount };
        } else {
            return { filename, size_mb: sizeMb, is_binary: isBinary, status: 'FAILED', error: valResult.errorMsg };
        }
    } catch (err) {
        if (tempMeltPath && fs.existsSync(tempMeltPath)) {
            try { fs.unlinkSync(tempMeltPath); } catch (e) {}
        }
        return { filename, size_mb: sizeMb, is_binary: isBinary, status: 'ERROR', error: err.message };
    }
}

async function runSmokeTests() {
    const results = [];
    
    // Validate all migrated saves first, then up to 5 non-migrated saves to keep test quick
    const migratedSaves = files.filter(f => f.includes('_migrated'));
    const normalSaves = files.filter(f => !f.includes('_migrated')).slice(0, 5); // limit normal saves to avoid melting gigabytes of files
    
    const targets = [...migratedSaves, ...normalSaves];
    
    for (const file of targets) {
        console.log(`Validating [${file}]...`);
        const res = await validateFile(file);
        results.push(res);
    }
    
    // Render report table
    console.log('\n=== SMOKE TEST REPORT ===\n');
    console.log('| Save Game Filename | Size (MB) | Format | Status | Details / States Count |');
    console.log('|---|---|---|---|---|');
    for (const r of results) {
        const formatStr = r.is_binary ? 'Binary' : 'Text';
        const detailStr = r.status === 'PASSED' ? `${r.states} states` : (r.error || '');
        console.log(`| ${r.filename} | ${r.size_mb} | ${formatStr} | ${r.status} | ${detailStr} |`);
    }
    console.log('\n=========================\n');
}

runSmokeTests();
