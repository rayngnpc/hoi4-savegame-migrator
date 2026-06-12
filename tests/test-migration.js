const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

// 1. Mock Electron module
const mockElectron = {
    app: {
        getPath: () => __dirname,
        whenReady: () => ({ then: (cb) => cb() }),
        on: () => {}
    },
    BrowserWindow: class {
        constructor() {}
        loadFile() {}
        on() {}
    },
    ipcMain: {
        handlers: {},
        handle: function(channel, callback) {
            this.handlers[channel] = callback;
        }
    },
    dialog: {
        showOpenDialog: () => ({ canceled: false, filePaths: [] })
    }
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'electron') {
        return mockElectron;
    }
    return originalRequire.apply(this, arguments);
};

// Now load main.js which will register handlers on our mockElectron.ipcMain
console.log('Loading main.js under mock electron...');
require('../main');

const ipcHandlers = mockElectron.ipcMain.handlers;
console.log('Registered handlers:', Object.keys(ipcHandlers));

// Setup test directory
const testSaveDir = path.join(__dirname, 'fixtures', 'temp_saves');
if (!fs.existsSync(testSaveDir)) {
    fs.mkdirSync(testSaveDir, { recursive: true });
}

// Helper to clean up temp saves directory
function cleanTempDir() {
    if (fs.existsSync(testSaveDir)) {
        try {
            const files = fs.readdirSync(testSaveDir);
            for (const file of files) {
                fs.unlinkSync(path.join(testSaveDir, file));
            }
        } catch (e) {}
    }
}

console.log('--- Running Migration Integration Tests ---');

// Mock IPC event sender
const createMockEvent = (logs, progress, status) => ({
    sender: {
        send: (channel, data) => {
            if (channel === 'migration-log') logs.push(data);
            if (channel === 'migration-progress') progress.push(data);
            if (channel === 'migration-status') status.push(data);
        }
    }
});

// Test Case 1: test_version_rewrite
async function test_version_rewrite() {
    console.log('Running: test_version_rewrite...');
    cleanTempDir();

    // Copy valid fixture to temp dir
    const srcPath = path.join(__dirname, 'fixtures', 'minimal_valid.hoi4');
    const destPath = path.join(testSaveDir, 'test_save.hoi4');
    fs.copyFileSync(srcPath, destPath);

    // Configure main.js paths
    await ipcHandlers['save-paths']({}, {
        game_dir: path.join(__dirname, 'fixtures'), // just needs launcher-settings.json or defines
        save_dir: testSaveDir
    });

    // We need target launcher settings and defines to exist so version can be determined
    const mockLauncherSettings = path.join(__dirname, 'fixtures', 'launcher-settings.json');
    const mockDefinesLuaDir = path.join(__dirname, 'fixtures', 'common', 'defines');
    fs.mkdirSync(mockDefinesLuaDir, { recursive: true });
    const mockDefinesLua = path.join(mockDefinesLuaDir, '00_defines.lua');

    fs.writeFileSync(mockLauncherSettings, JSON.stringify({ version: 'v1.19.0.mock' }));
    fs.writeFileSync(mockDefinesLua, 'SAVE_VERSION = 33\nMINOR_SAVE_VERSION = 1');

    const logs = [];
    const progress = [];
    const status = [];
    const event = createMockEvent(logs, progress, status);

    // Migrate
    await ipcHandlers['migrate-save'](event, 'test_save.hoi4', {
        scenarios: ['vanilla'],
        adjust_states: false
    });

    if (status[status.length - 1] !== 'success') {
        console.error('Migration logs on failure:', logs);
    }
    assert.strictEqual(status[status.length - 1], 'success', 'Migration should succeed');
    
    // Verify backup exists
    assert.ok(fs.existsSync(destPath + '.bak'), 'Backup file .bak should exist');

    // Read migrated file
    const content = fs.readFileSync(destPath, 'utf8');
    assert.ok(content.includes('version="v1.19.0.mock"'), 'Version header should be updated');
    assert.ok(content.includes('save_version=33'), 'save_version header should be updated');
    assert.ok(content.includes('minor_save_version=1'), 'minor_save_version header should be updated');

    // Cleanup mock game configs
    fs.unlinkSync(mockLauncherSettings);
    fs.unlinkSync(mockDefinesLua);
    fs.rmdirSync(mockDefinesLuaDir);
    fs.rmdirSync(path.join(__dirname, 'fixtures', 'common'));
}

// Test Case 2: test_atomic_write_on_failure
async function test_atomic_write_on_failure() {
    console.log('Running: test_atomic_write_on_failure...');
    cleanTempDir();

    // Copy unbalanced brace fixture to temp dir
    const srcPath = path.join(__dirname, 'fixtures', 'missing_closing_brace.hoi4');
    const destPath = path.join(testSaveDir, 'test_save.hoi4');
    fs.copyFileSync(srcPath, destPath);

    // Configure paths
    await ipcHandlers['save-paths']({}, {
        game_dir: path.join(__dirname, 'fixtures'),
        save_dir: testSaveDir
    });

    const logs = [];
    const progress = [];
    const status = [];
    const event = createMockEvent(logs, progress, status);

    // Migrate (pre-migration validation should fail and abort)
    await ipcHandlers['migrate-save'](event, 'test_save.hoi4', {
        scenarios: ['vanilla'],
        adjust_states: false
    });

    assert.strictEqual(status[status.length - 1], 'failed', 'Migration should fail due to pre-migration validation');
    assert.ok(logs.some(log => log.includes('Pre-migration validation failed')), 'Logs should mention validation failure');

    // Original file should remain untouched (should match missing_closing_brace.hoi4)
    const currentContent = fs.readFileSync(destPath, 'utf8');
    const originalContent = fs.readFileSync(srcPath, 'utf8');
    assert.strictEqual(currentContent, originalContent, 'Original file should not have been overwritten or changed');
    
    // No .tmp files should be left over
    assert.ok(!fs.existsSync(destPath + '.tmp'), 'No temp files should remain');
}

// Test Case 3: test_manual_validate_save
async function test_manual_validate_save() {
    console.log('Running: test_manual_validate_save...');
    cleanTempDir();

    // Copy valid fixture
    fs.copyFileSync(
        path.join(__dirname, 'fixtures', 'minimal_valid.hoi4'),
        path.join(testSaveDir, 'test_valid.hoi4')
    );
    // Copy invalid fixture
    fs.copyFileSync(
        path.join(__dirname, 'fixtures', 'orphan_state.hoi4'),
        path.join(testSaveDir, 'test_invalid.hoi4')
    );

    // Run manual validations
    const resValid = await ipcHandlers['validate-save']({}, 'test_valid.hoi4');
    assert.strictEqual(resValid.status, 'success', 'Valid save should pass validation');
    assert.strictEqual(resValid.stateCount, 1, 'Valid save should have 1 state');

    const resInvalid = await ipcHandlers['validate-save']({}, 'test_invalid.hoi4');
    assert.strictEqual(resInvalid.status, 'failed', 'Invalid save should fail validation');
    assert.ok(resInvalid.error.includes('Orphaned/leaked state block'), 'Error should be about orphaned state');
}

async function runTests() {
    try {
        await test_version_rewrite();
        await test_atomic_write_on_failure();
        await test_manual_validate_save();
        console.log('ALL MIGRATION TESTS PASSED SUCCESSFULLY!\n');
    } catch (e) {
        console.error('TEST SUITE FAILED:', e);
        process.exit(1);
    } finally {
        cleanTempDir();
        try { fs.rmdirSync(testSaveDir); } catch(e) {}
    }
}

runTests();
