const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const os = require('os');
const validator = require('./validator');

let mainWindow;

// Paths Configuration
let GAME_DIR = '';
let MODS_ROOT = ''; // steamapps/workshop/content/394360/
let SAVE_DIR = '';

// Default values for common mods
const MOD_IDS = {
    kaiserredux: '2076426030',
    roadto56: '820260968'
};

// Auto-detect saves directory
function detectSavesDir() {
    let documents = '';
    try {
        documents = app.getPath('documents');
    } catch (e) {
        documents = path.join(os.homedir(), 'Documents');
    }

    const pathsToTry = [];
    if (process.platform === 'win32' || process.platform === 'darwin') {
        pathsToTry.push(path.join(documents, 'Paradox Interactive', 'Hearts of Iron IV', 'save games'));
        pathsToTry.push(path.join(documents, 'Paradox Interactive', 'Hearts of Iron IV', 'savegames'));
    } else {
        pathsToTry.push(path.join(os.homedir(), '.local', 'share', 'Paradox Interactive', 'Hearts of Iron IV', 'save games'));
        pathsToTry.push(path.join(os.homedir(), '.local', 'share', 'Paradox Interactive', 'Hearts of Iron IV', 'savegames'));
    }

    for (const p of pathsToTry) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return '';
}

// Auto-detect game directory & mods root
function detectGamePaths() {
    const drives = process.platform === 'win32' ? ['C:', 'D:', 'E:', 'F:', 'G:'] : [''];
    const home = os.homedir();

    const commonGameDirs = [
        'Program Files (x86)/Steam/steamapps/common/Hearts of Iron IV',
        'Program Files/Steam/steamapps/common/Hearts of Iron IV',
        'SteamLibrary/steamapps/common/Hearts of Iron IV',
        'Steam/steamapps/common/Hearts of Iron IV',
        // macOS default Steam path
        'Library/Application Support/Steam/steamapps/common/Hearts of Iron IV',
        // Linux default Steam paths
        '.steam/steam/steamapps/common/Hearts of Iron IV',
        '.local/share/Steam/steamapps/common/Hearts of Iron IV'
    ];

    for (const drive of drives) {
        for (const dir of commonGameDirs) {
            const fullPath = drive ? path.join(drive, dir) : path.join(home, dir);
            if (fs.existsSync(fullPath)) {
                GAME_DIR = path.resolve(fullPath);
                
                // Workshop mods directory is usually on the same Steam library drive
                const workshopPath = path.resolve(path.join(fullPath, '..', '..', 'workshop', 'content', '394360'));
                if (fs.existsSync(workshopPath)) {
                    MODS_ROOT = workshopPath;
                }
                return;
            }
        }
    }
}

// Setup initial paths
detectGamePaths();
if (!MODS_ROOT && GAME_DIR) {
    MODS_ROOT = path.resolve(path.join(GAME_DIR, '..', '..', 'workshop', 'content', '394360'));
}

// Get the correct rakaly binary path
function getRakalyBinary() {
    const baseDir = __dirname;
    
    let binaryName = '';
    if (process.platform === 'win32') {
        binaryName = 'rakaly-win.exe';
    } else if (process.platform === 'darwin') {
        // Check for Apple Silicon vs Intel
        binaryName = os.arch() === 'arm64' ? 'rakaly-mac-arm64' : 'rakaly-mac-x64';
    } else {
        binaryName = 'rakaly-linux';
    }
    
    const binaryPath = path.join(baseDir, 'bin', binaryName);
    return fs.existsSync(binaryPath) ? binaryPath : null;
}

// Parse version strings from game
function getGameVersion() {
    if (!GAME_DIR) return 'Unknown';
    const settingsPath = path.join(GAME_DIR, 'launcher-settings.json');
    if (fs.existsSync(settingsPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            return data.version || 'Unknown';
        } catch (e) {}
    }
    return 'Unknown';
}

function getTargetDefinesVersion() {
    if (!GAME_DIR) return { save_version: 33, minor_save_version: 0 };
    const definesPath = path.join(GAME_DIR, 'common', 'defines', '00_defines.lua');
    let save_version = 33;
    let minor_save_version = 0;
    
    if (fs.existsSync(definesPath)) {
        try {
            const content = fs.readFileSync(definesPath, 'utf8');
            const sv_match = content.match(/SAVE_VERSION\s*=\s*(\d+)/);
            if (sv_match) save_version = parseInt(sv_match[1]);
            const msv_match = content.match(/MINOR_SAVE_VERSION\s*=\s*(\d+)/);
            if (msv_match) minor_save_version = parseInt(msv_match[1]);
        } catch (e) {}
    }
    return { save_version, minor_save_version };
}

// Get mod supported version from descriptor.mod
function getModSupportedVersion(workshopId) {
    if (!MODS_ROOT || !workshopId) return null;
    const descPath = path.join(MODS_ROOT, workshopId, 'descriptor.mod');
    if (fs.existsSync(descPath)) {
        try {
            const content = fs.readFileSync(descPath, 'utf8');
            const match = content.match(/supported_version\s*=\s*"([^"]*)"/);
            if (match) {
                return match[1];
            }
        } catch (e) {
            console.error(`Error reading descriptor for mod ${workshopId}:`, e.message);
        }
    }
    return null;
}

// Compare target game version against mod's supported version
function checkVersionCompat(gameVer, supportedVer) {
    if (!supportedVer) return true; // Assume compatible if unknown
    const cleanGame = gameVer.replace(/^[a-zA-Z\s]+v/, '').trim();
    const cleanSupported = supportedVer.replace(/^v/, '').trim();
    
    // Extract version numbers like 1.18.2
    const gameMatch = cleanGame.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!gameMatch) return false;
    
    const gameMajor = gameMatch[1];
    const gameMinor = gameMatch[2];
    const gamePatch = gameMatch[3] || '0';
    
    // Check supported version format (e.g. "1.18.*" or "1.18.2")
    if (cleanSupported.includes('*')) {
        const regexStr = '^' + cleanSupported.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$';
        try {
            const regex = new RegExp(regexStr);
            const gameShort = `${gameMajor}.${gameMinor}.${gamePatch}`;
            return regex.test(gameShort) || regex.test(cleanGame);
        } catch (e) {
            // fallback
        }
    }
    
    const suppMatch = cleanSupported.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
    if (suppMatch) {
        const suppMajor = suppMatch[1];
        const suppMinor = suppMatch[2];
        const suppPatch = suppMatch[3];
        
        // If they match major and minor, they are compatible
        if (gameMajor === suppMajor && gameMinor === suppMinor) {
            if (suppPatch === undefined || suppPatch === '*' || gamePatch === suppPatch) {
                return true;
            }
        }
    }
    
    return false;
}

// Scan saves and metadata
function scanSaveMetadata(filepath) {
    const filename = path.basename(filepath);
    const stats = fs.statSync(filepath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    
    const modifiedTime = stats.mtime;
    const modifiedStr = modifiedTime.toISOString().replace('T', ' ').substring(0, 19);

    let fd;
    let buffer = Buffer.alloc(50000);
    try {
        fd = fs.openSync(filepath, 'r');
        fs.readSync(fd, buffer, 0, 50000, 0);
    } catch (e) {
        return null;
    } finally {
        if (fd) fs.closeSync(fd);
    }

    const isBinary = buffer.slice(0, 7).toString() === 'HOI4bin';
    const text = buffer.toString('ascii');

    let date = 'Unknown Date';
    const dateMatch = text.match(/\b(\d{4}\.\d{1,2}\.\d{1,2}\.\d{1,2})\b/);
    if (dateMatch) {
        date = dateMatch[1];
    } else {
        const fnMatch = filename.match(/_(\d{4})_(\d{2})_(\d{2})_(\d{2})/);
        if (fnMatch) {
            date = `${fnMatch[1]}.${fnMatch[2]}.${fnMatch[3]}.${fnMatch[4]}`;
        }
    }

    let player = 'Unknown';
    const playerMatch = text.match(/player="?([A-Z0-9_]{3})"?/);
    if (playerMatch) {
        player = playerMatch[1];
    } else {
        const tags = text.substring(0, 200).match(/\b([A-Z]{3})\b/g);
        if (tags) player = tags[0];
    }

    let version = 'Unknown Version';
    const verMatch = text.match(/([A-Za-z ]+ v\d+\.\d+\.\d+\.\d+\.[a-z0-9]+)/) || text.match(/(v\d+\.\d+\.\d+\.\d+)/);
    if (verMatch) {
        version = verMatch[1];
    }

    const mods = [];
    const modsBlockMatch = text.match(/\bmods\s*=\s*\{([^}]*)\}/);
    if (modsBlockMatch) {
        const blockContent = modsBlockMatch[1];
        const quotedMatches = [...blockContent.matchAll(/"([^"]+)"/g)];
        quotedMatches.forEach(match => {
            if (!mods.includes(match[1])) mods.push(match[1]);
        });
    }
    
    // Fallback search
    if (mods.length === 0) {
        const knownMods = ["KaiserreduX", "Immersive Music Mod - Allies", "Immersive Music Mod - Axis", "Immersive Music Mod - Comintern, China, and Non-Aligned"];
        for (const m of knownMods) {
            if (text.includes(m) && !mods.includes(m)) mods.push(m);
        }
    }

    return { filename, size_mb: parseFloat(sizeMb), last_modified: modifiedStr, is_binary: isBinary, date, player, version, mods };
}

// Scan states from chosen database directories
function scanDbStates(activeScenarios) {
    const dbStates = {};
    const dirs = [];
    
    // Add base game states if Vanilla or any mod is checked
    if (GAME_DIR) {
        dirs.push(path.join(GAME_DIR, 'history', 'states'));
    }

    // Add selected mod states
    activeScenarios.forEach(scen => {
        if (scen === 'kaiserredux' && MODS_ROOT) {
            dirs.push(path.join(MODS_ROOT, MOD_IDS.kaiserredux, 'history', 'states'));
        } else if (scen === 'roadto56' && MODS_ROOT) {
            dirs.push(path.join(MODS_ROOT, MOD_IDS.roadto56, 'history', 'states'));
        } else if (scen.startsWith('custom_') && MODS_ROOT) {
            const workshopId = scen.replace('custom_', '');
            dirs.push(path.join(MODS_ROOT, workshopId, 'history', 'states'));
        }
    });

    dirs.forEach(sDir => {
        if (!fs.existsSync(sDir)) return;
        const files = fs.readdirSync(sDir);
        files.forEach(file => {
            if (file.endsWith('.txt')) {
                const filepath = path.join(sDir, file);
                try {
                    const content = fs.readFileSync(filepath, 'utf8');
                    const idMatch = content.match(/\bid\s*=\s*(\d+)/);
                    const ownerMatch = content.match(/\bowner\s*=\s*"?([a-zA-Z0-9]{3})"?/);
                    if (idMatch && ownerMatch) {
                        const stateId = parseInt(idMatch[1]);
                        const owner = ownerMatch[1].toUpperCase();
                        dbStates[stateId] = owner; // Mods override base game
                    }
                } catch (e) {}
            }
        });
    });

    return dbStates;
}

// Window creation
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 850,
        resizable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        title: 'HOI4 Save Game Migrator',
        icon: path.join(__dirname, 'ww2-battle-animated.png')
    });

    mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'));
    // mainWindow.webContents.openDevTools(); // Debug
}

app.whenReady().then(() => {
    SAVE_DIR = detectSavesDir();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Communication Handlers
ipcMain.handle('select-directory', async (event, defaultPath) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        defaultPath: defaultPath || undefined
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('get-status', () => {
    const binaryPath = getRakalyBinary();
    const targetVer = getGameVersion();
    const { save_version, minor_save_version } = getTargetDefinesVersion();
    
    const kxSupported = getModSupportedVersion(MOD_IDS.kaiserredux);
    const r56Supported = getModSupportedVersion(MOD_IDS.roadto56);
    
    return {
        game_dir: GAME_DIR,
        mods_root: MODS_ROOT,
        save_dir: SAVE_DIR,
        rakaly_found: binaryPath !== null,
        rakaly_path: binaryPath,
        game_version: targetVer,
        target_save_version: save_version,
        target_minor_version: minor_save_version,
        mods_compat: {
            kaiserredux: {
                supported: kxSupported || 'Unknown',
                compatible: checkVersionCompat(targetVer, kxSupported)
            },
            roadto56: {
                supported: r56Supported || 'Unknown',
                compatible: checkVersionCompat(targetVer, r56Supported)
            }
        }
    };
});

ipcMain.handle('check-mod-compatibility', (event, workshopId) => {
    const targetVer = getGameVersion();
    const supported = getModSupportedVersion(workshopId);
    if (!supported) {
        return { supported: 'Unknown', compatible: true };
    }
    return {
        supported: supported,
        compatible: checkVersionCompat(targetVer, supported)
    };
});

ipcMain.handle('get-saves', () => {
    const list = [];
    if (SAVE_DIR && fs.existsSync(SAVE_DIR)) {
        const files = fs.readdirSync(SAVE_DIR);
        files.forEach(file => {
            if (file.endsWith('.hoi4') && !file.endsWith('_melted.hoi4')) {
                const meta = scanSaveMetadata(path.join(SAVE_DIR, file));
                if (meta) {
                    const backupPath = path.join(SAVE_DIR, `${file}.bak`);
                    meta.has_backup = fs.existsSync(backupPath);
                    list.push(meta);
                }
            }
        });
    }
    // Sort newest first
    list.sort((a, b) => b.last_modified.localeCompare(a.last_modified));
    return list;
});

ipcMain.handle('save-paths', (event, paths) => {
    GAME_DIR = paths.game_dir || GAME_DIR;
    MODS_ROOT = paths.mods_root || MODS_ROOT;
    SAVE_DIR = paths.save_dir || SAVE_DIR;
    return { status: 'success' };
});

ipcMain.handle('rollback-save', async (event, filename) => {
    const inputPath = path.join(SAVE_DIR, filename);
    const backupPath = path.join(SAVE_DIR, `${filename}.bak`);
    if (fs.existsSync(backupPath)) {
        try {
            fs.copyFileSync(backupPath, inputPath);
            fs.unlinkSync(backupPath);
            return { status: 'success' };
        } catch (e) {
            return { status: 'failed', error: e.message };
        }
    }
    return { status: 'failed', error: 'No backup file found' };
});

ipcMain.handle('validate-save', async (event, filename) => {
    try {
        const filepath = path.join(SAVE_DIR, filename);
        if (!fs.existsSync(filepath)) {
            return { status: 'failed', error: 'File does not exist' };
        }
        
        let content;
        
        // If it's a binary save, we need to melt it first to validate
        const buffer = Buffer.alloc(7);
        const fd = fs.openSync(filepath, 'r');
        fs.readSync(fd, buffer, 0, 7, 0);
        fs.closeSync(fd);
        
        const isBinary = buffer.toString() === 'HOI4bin';
        
        if (isBinary) {
            const binaryPath = getRakalyBinary();
            if (!binaryPath) {
                return { status: 'failed', error: 'Engine binary not found (needed to melt binary save for validation)' };
            }
            const tempMeltPath = path.join(SAVE_DIR, `${path.basename(filename, '.hoi4')}_validate_melt_tmp.hoi4`);
            const defaultMeltPath = path.join(SAVE_DIR, `${path.basename(filename, '.hoi4')}_melted.hoi4`);
            
            // Execute melt
            await new Promise((resolve, reject) => {
                execFile(binaryPath, ['melt', '--unknown-key', 'stringify', filepath], (error, stdout, stderr) => {
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
        
        // Run pre-migration validation (or general check)
        const result = validator.validatePreMigration(content);
        if (!result.valid) {
            return { status: 'failed', error: result.errorMsg, line: result.errorLine, col: result.errorCol };
        }
        
        return { status: 'success', stateCount: result.stateCount || 0 };
    } catch (e) {
        return { status: 'failed', error: e.message };
    }
});

ipcMain.handle('migrate-save', async (event, filename, options) => {
    const webContents = event.sender;
    const sendLog = (msg) => {
        const timestamp = new Date().toLocaleTimeString();
        webContents.send('migration-log', `[${timestamp}] ${msg}`);
    };
    const sendProgress = (p) => webContents.send('migration-progress', p);
    const sendStatus = (s) => webContents.send('migration-status', s);

    sendStatus('processing');
    sendProgress(5);
    sendLog(`Starting migration for: ${filename}`);

    const binaryPath = getRakalyBinary();
    if (!binaryPath) {
        sendLog('ERROR: Engine binary not found for your operating system!');
        sendStatus('failed');
        return;
    }

    const inputPath = path.join(SAVE_DIR, filename);
    const backupPath = path.join(SAVE_DIR, `${filename}.bak`);
    const baseName = path.basename(filename, '.hoi4');
    const tempMeltPath = path.join(SAVE_DIR, `${baseName}_melted_tmp.hoi4`);
    const defaultMeltPath = path.join(SAVE_DIR, `${baseName}_melted.hoi4`);

    // Create backup before editing
    if (!fs.existsSync(backupPath)) {
        try {
            fs.copyFileSync(inputPath, backupPath);
            sendLog(`Backup created at: ${filename}.bak`);
        } catch (err) {
            sendLog(`WARNING: Failed to create backup: ${err.message}`);
        }
    } else {
        sendLog(`Backup file already exists. Preserving original backup.`);
    }

    try {
        // 1. Melt binary save
        sendLog(`Executing engine melt on save game...`);
        sendProgress(15);
        
        await new Promise((resolve, reject) => {
            execFile(binaryPath, ['melt', '--unknown-key', 'stringify', inputPath], (error, stdout, stderr) => {
                if (fs.existsSync(defaultMeltPath) || (error && stderr.includes('already plaintext'))) {
                    resolve();
                } else if (error) {
                    reject(new Error(stderr || error.message || stdout));
                } else {
                    resolve();
                }
            });
        });

        // Resolve temp paths
        if (fs.existsSync(defaultMeltPath)) {
            fs.renameSync(defaultMeltPath, tempMeltPath);
        } else if (!fs.existsSync(tempMeltPath)) {
            fs.copyFileSync(inputPath, tempMeltPath);
        }

        sendLog('Save game melted to plain-text successfully.');
        sendProgress(40);

        // 2. Fetch target versions
        const targetVersion = getGameVersion();
        const { save_version, minor_save_version } = getTargetDefinesVersion();
        sendLog(`Target Version: ${targetVersion}`);
        sendLog(`Target SAVE_VERSION: ${save_version}, MINOR_SAVE_VERSION: ${minor_save_version}`);

        // 3. Scan states map
        const activeScenarios = options.scenarios || ['vanilla'];
        sendLog(`Scanning state files for scenarios: ${activeScenarios.join(', ')}...`);
        const dbStates = scanDbStates(activeScenarios);
        sendLog(`Loaded ${Object.keys(dbStates).length} states from selected map database.`);
        sendProgress(60);

        // 4. Read melted contents and replace
        sendLog('Reading melted save data...');
        let content = fs.readFileSync(tempMeltPath, 'utf8');

        sendLog('Running pre-migration validation checks...');
        const preVal = validator.validatePreMigration(content);
        if (!preVal.valid) {
            throw new Error(`Pre-migration validation failed: ${preVal.errorMsg}${preVal.errorLine ? ` at line ${preVal.errorLine}` : ''}`);
        }
        sendLog('Pre-migration validation passed.');

        sendLog('Rewriting compatibility headers...');
        content = content.replace(/version="[^"]*"/, `version="${targetVersion}"`);
        content = content.replace(/save_version=\d+/, `save_version=${save_version}`);
        content = content.replace(/minor_save_version=\d+/, `minor_save_version=${minor_save_version}`);

        // Align states block
        if (options.adjust_states) {
            sendLog('Re-aligning state allocations...');
            
            // Find root-level states={ block precisely by brace depth
            let statesStart = -1;
            let statesMatchLength = 0;
            let braceDepth = 0;
            let inString = false;
            let inComment = false;
            const contentLen = content.length;
            
            for (let i = 0; i < contentLen; i++) {
                const char = content[i];
                if (inComment) {
                    if (char === '\n') inComment = false;
                    continue;
                }
                if (inString) {
                    if (char === '\\') {
                        i++;
                    } else if (char === '"') {
                        inString = false;
                    }
                    continue;
                }
                if (char === '#') {
                    inComment = true;
                    continue;
                }
                if (char === '"') {
                    inString = true;
                    continue;
                }
                
                if (char === '{') {
                    braceDepth++;
                } else if (char === '}') {
                    braceDepth--;
                } else if (braceDepth === 0) {
                    if (content.startsWith('states', i)) {
                        let j = i + 6;
                        while (j < contentLen && /\s/.test(content[j])) j++;
                        if (content[j] === '=') {
                            j++;
                            while (j < contentLen && /\s/.test(content[j])) j++;
                            if (content[j] === '{') {
                                statesStart = i;
                                statesMatchLength = (j + 1) - i;
                                break;
                            }
                        }
                    }
                }
            }

            if (statesStart !== -1) {
                // Find matching closing brace
                let statesEnd = -1;
                let depth = 1;
                let idx = statesStart + statesMatchLength;
                inString = false;
                inComment = false;
                
                while (idx < contentLen && depth > 0) {
                    const char = content[idx];
                    if (inComment) {
                        if (char === '\n') inComment = false;
                        idx++;
                        continue;
                    }
                    if (inString) {
                        if (char === '\\') {
                            idx += 2;
                        } else {
                            if (char === '"') inString = false;
                            idx++;
                        }
                        continue;
                    }
                    if (char === '#') {
                        inComment = true;
                        idx++;
                        continue;
                    }
                    if (char === '"') {
                        inString = true;
                        idx++;
                        continue;
                    }
                    
                    if (char === '{') {
                        depth++;
                    } else if (char === '}') {
                        depth--;
                        if (depth === 0) {
                            statesEnd = idx + 1; // Include the closing brace
                            break;
                        }
                    }
                    idx++;
                }

                if (statesEnd === -1) {
                    throw new Error("Could not find matching closing brace for states block.");
                }

                // Verify boundaries
                const beforeChar = statesStart > 0 ? content[statesStart - 1] : '\n';
                const afterChar = statesEnd < content.length ? content[statesEnd] : '\n';
                if (!/\s/.test(beforeChar) || !/\s/.test(afterChar)) {
                    sendLog("WARNING: states block boundaries are not standard whitespace.");
                }

                const statesBlock = content.substring(statesStart, statesEnd);

                // Parse individual state blocks by tracking brace depth
                const stateBlocks = {};
                let bDepth = 0;
                let currentId = null;
                let currentBlockStart = 0;
                let token = '';
                
                let sIdx = 0;
                const blockLen = statesBlock.length;
                let inBlockString = false;
                let inBlockComment = false;
                
                while (sIdx < blockLen) {
                    const char = statesBlock[sIdx];
                    
                    if (inBlockComment) {
                        if (char === '\n') {
                            inBlockComment = false;
                            token = '';
                        }
                        sIdx++;
                        continue;
                    }
                    if (inBlockString) {
                        if (char === '\\') {
                            sIdx += 2;
                        } else {
                            if (char === '"') inBlockString = false;
                            sIdx++;
                        }
                        continue;
                    }
                    if (char === '#') {
                        inBlockComment = true;
                        token = '';
                        sIdx++;
                        continue;
                    }
                    if (char === '"') {
                        inBlockString = true;
                        token = '';
                        sIdx++;
                        continue;
                    }
                    
                    if (char === '{') {
                        bDepth++;
                        if (bDepth === 2) {
                            const cleanToken = token.trim();
                            let keyStr = cleanToken;
                            if (keyStr.endsWith('=')) {
                                keyStr = keyStr.substring(0, keyStr.length - 1).trim();
                            }
                            const potentialId = parseInt(keyStr);
                            if (!isNaN(potentialId) && potentialId > 0 && /^\d+$/.test(keyStr)) {
                                currentId = potentialId;
                                let keyStart = sIdx - 1;
                                while (keyStart >= 0 && /\s/.test(statesBlock[keyStart])) keyStart--;
                                if (statesBlock[keyStart] === '=') {
                                    keyStart--;
                                    while (keyStart >= 0 && /\s/.test(statesBlock[keyStart])) keyStart--;
                                    while (keyStart >= 0 && /\d/.test(statesBlock[keyStart])) keyStart--;
                                    currentBlockStart = keyStart + 1;
                                } else {
                                    currentId = null;
                                }
                            }
                        }
                        token = '';
                    } else if (char === '}') {
                        if (bDepth === 2 && currentId !== null) {
                            const stateBlockContent = statesBlock.substring(currentBlockStart, sIdx + 1);
                            stateBlocks[currentId] = stateBlockContent;
                            currentId = null;
                        }
                        bDepth--;
                        token = '';
                    } else if (bDepth === 1) {
                        if (char === '\n') {
                            if (!token.includes('=')) {
                                token = '';
                            }
                        } else if (!/\s/.test(char)) {
                            token += char;
                        } else {
                            if (token.length > 0 && !token.endsWith('=')) {
                                token += char;
                            }
                        }
                    }
                    sIdx++;
                }

                // Align states with database
                const newStateBlocks = [];
                let added = 0;
                let removed = 0;

                Object.keys(dbStates).sort((a, b) => a - b).forEach(stateId => {
                    const id = parseInt(stateId);
                    if (stateBlocks[id]) {
                        newStateBlocks.push(stateBlocks[id]);
                    } else {
                        const owner = dbStates[id];
                        const defaultBlock = `\t${id}={\n\t\tbuildings={ }\n\t\towner="${owner}"\n\t\tcontroller="${owner}"\n\t\tmanpower_pool={\n\t\t\tavailable=0\n\t\t\tlocked=0\n\t\t\ttotal=0\n\t\t}\n\t\tresistance={ }\n\t}`;
                        newStateBlocks.push(defaultBlock);
                        added++;
                    }
                });

                Object.keys(stateBlocks).forEach(stateId => {
                    const id = parseInt(stateId);
                    if (!dbStates[id]) removed++;
                });

                sendLog(`Aligned states: added ${added} missing, removed ${removed} obsolete.`);
                
                const newStatesText = "states={\n" + newStateBlocks.join('\n') + "\n}";
                content = content.substring(0, statesStart) + newStatesText + content.substring(statesEnd);
            } else {
                sendLog('WARNING: states block not found! Skipping alignment.');
            }
        }
        sendProgress(85);

        // 5. Write migrated save atomically with verification
        sendLog('Running post-migration validation checks...');
        const originalSize = fs.statSync(inputPath).size;
        const expectedCount = options.adjust_states ? Object.keys(dbStates).length : undefined;
        
        const postVal = validator.validatePostMigration(content, expectedCount, originalSize, targetVersion, save_version, minor_save_version);
        if (!postVal.valid) {
            throw new Error(`Post-migration validation failed: ${postVal.errorMsg}${postVal.errorLine ? ` at line ${postVal.errorLine}` : ''}`);
        }
        sendLog('Post-migration validation passed.');

        sendLog(`Writing migrated save file atomically: ${filename}...`);
        const tempOutPath = `${inputPath}.tmp`;
        fs.writeFileSync(tempOutPath, content, 'utf8');

        // Verify temp file exists and has size
        const tempStats = fs.statSync(tempOutPath);
        if (tempStats.size === 0) {
            throw new Error("Failed to write output file (file is empty).");
        }

        fs.renameSync(tempOutPath, inputPath);
        sendLog('Atomic write completed successfully.');

        // Cleanup
        if (fs.existsSync(tempMeltPath)) {
            fs.unlinkSync(tempMeltPath);
        }

        sendLog('Save game migrated and repaired successfully!');
        sendProgress(100);
        sendStatus('success');
    } catch (e) {
        sendLog(`CRITICAL ERROR: ${e.message}`);
        if (fs.existsSync(tempMeltPath)) {
            try { fs.unlinkSync(tempMeltPath); } catch (err) {}
        }
        sendStatus('failed');
    }
});
