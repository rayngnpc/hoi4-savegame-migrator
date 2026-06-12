const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getStatus: () => ipcRenderer.invoke('get-status'),
    getSaves: () => ipcRenderer.invoke('get-saves'),
    migrateSave: (filename, options) => ipcRenderer.invoke('migrate-save', filename, options),
    savePaths: (paths) => ipcRenderer.invoke('save-paths', paths),
    selectDirectory: (defaultPath) => ipcRenderer.invoke('select-directory', defaultPath),
    rollbackSave: (filename) => ipcRenderer.invoke('rollback-save', filename),
    validateSave: (filename) => ipcRenderer.invoke('validate-save', filename),
    checkModCompatibility: (workshopId) => ipcRenderer.invoke('check-mod-compatibility', workshopId),
    onMigrationLog: (callback) => ipcRenderer.on('migration-log', (event, value) => callback(value)),
    onMigrationProgress: (callback) => ipcRenderer.on('migration-progress', (event, value) => callback(value)),
    onMigrationStatus: (callback) => ipcRenderer.on('migration-status', (event, value) => callback(value))
});
