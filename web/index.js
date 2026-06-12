document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const gameDirInput = document.getElementById("game-dir-input");
    const modsRootInput = document.getElementById("mods-root-input");
    const saveDirInput = document.getElementById("save-dir-input");
    const savePathsBtn = document.getElementById("save-paths-btn");
    
    // Directory Browse Buttons
    const btnBrowseGame = document.getElementById("btn-browse-game");
    const btnBrowseMods = document.getElementById("btn-browse-mods");
    const btnBrowseSaves = document.getElementById("btn-browse-saves");
    
    const targetVersionBadge = document.getElementById("target-version-badge");
    const targetVersionStr = document.getElementById("target-version-str");
    const targetSaveVer = document.getElementById("target-save-ver");
    const rakalyStatusBadge = document.getElementById("rakaly-status-badge");
    
    const savesTbody = document.getElementById("saves-tbody");
    const refreshSavesBtn = document.getElementById("refresh-saves-btn");
    const savesSearchInput = document.getElementById("saves-search-input");
    const savesSortSelect = document.getElementById("saves-sort-select");
    const filterTabs = document.querySelectorAll(".filter-tab");
    
    const migrationProgressBar = document.getElementById("migration-progress-bar");
    const migrationStatusText = document.getElementById("migration-status-text");
    const migrationProgressTask = document.getElementById("migration-progress-task");
    const migrationProgressPercent = document.getElementById("migration-progress-percent");
    const terminalLogs = document.getElementById("terminal-logs");

    const scenVanilla = document.getElementById("scen-vanilla");
    const scenKaiserredux = document.getElementById("scen-kaiserredux");
    const scenRoadto56 = document.getElementById("scen-roadto56");
    
    const customModInput = document.getElementById("custom-mod-input");
    const addCustomModBtn = document.getElementById("add-custom-mod-btn");
    const customPillsContainer = document.getElementById("custom-pills-container");

    // Custom Confirmation Modal Elements
    const confirmModalBackdrop = document.getElementById("confirm-modal-backdrop");
    const confirmFileName = document.getElementById("confirm-file-name");
    const confirmVersionMap = document.getElementById("confirm-version-map");
    const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
    const confirmOkBtn = document.getElementById("confirm-ok-btn");
    const confirmWarningBox = document.getElementById("confirm-warning-box");
    const confirmWarningText = document.getElementById("confirm-warning-text");

    let targetGameVersion = "";
    const customScenarios = [];
    
    // Grid States Map
    let allSaves = [];
    let activeFilterTab = "all";
    let activeSortOption = "modified_desc";
    let activeSearchQuery = "";
    const modCompatMap = {};

    // Folder Select Browse Handlers
    btnBrowseGame.addEventListener("click", async () => {
        const res = await window.api.selectDirectory(gameDirInput.value);
        if (res) {
            gameDirInput.value = res;
        }
    });

    btnBrowseMods.addEventListener("click", async () => {
        const res = await window.api.selectDirectory(modsRootInput.value);
        if (res) {
            modsRootInput.value = res;
        }
    });

    btnBrowseSaves.addEventListener("click", async () => {
        const res = await window.api.selectDirectory(saveDirInput.value);
        if (res) {
            saveDirInput.value = res;
        }
    });

    // Wire up Scenario Pill Click Event Listeners
    document.querySelectorAll(".scenario-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            const checkbox = pill.querySelector("input[type='checkbox']");
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                if (checkbox.checked) {
                    pill.classList.add("active");
                } else {
                    pill.classList.remove("active");
                }
            }
        });
    });

    // Get selected scenarios list
    function getSelectedScenarios() {
        const list = [];
        if (scenVanilla.checked) list.push("vanilla");
        if (scenKaiserredux.checked) list.push("kaiserredux");
        if (scenRoadto56.checked) list.push("roadto56");
        
        // Add custom scenarios
        customScenarios.forEach(id => {
            list.push(`custom_${id}`);
        });
        return list;
    }

    // Dynamic custom mod loader
    addCustomModBtn.addEventListener("click", async () => {
        const id = customModInput.value.trim();
        if (!id || isNaN(id)) {
            alert("Please enter a valid numeric Steam Workshop ID!");
            return;
        }

        if (customScenarios.includes(id)) {
            alert("This mod has already been added!");
            return;
        }

        // Fetch compatibility status for this mod workshop ID
        addCustomModBtn.disabled = true;
        let compatData = { supported: "Unknown", compatible: true };
        try {
            compatData = await window.api.checkModCompatibility(id);
        } catch (e) {
            console.error("Failed to check compatibility for mod " + id, e);
        } finally {
            addCustomModBtn.disabled = false;
        }

        modCompatMap[id] = compatData;
        customScenarios.push(id);

        const isComp = compatData.compatible;
        const suppVer = compatData.supported || "Unknown";
        const statusText = isComp 
            ? (suppVer === "Unknown" ? "✓ Unknown" : `✓ supports ${suppVer}`) 
            : `⚠️ Outdated (supports ${suppVer})`;
        const statusClass = isComp ? "success" : "danger";

        // Add to UI as a beautiful removable pill badge
        const pill = document.createElement("div");
        pill.className = "custom-pill";
        pill.id = `custom-pill-${id}`;
        pill.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:2px; text-align:left;">
                <span>Mod: ${id}</span>
                <span class="mod-compat-lbl ${statusClass}" style="margin-top:0; font-size:9px;">${statusText}</span>
            </div>
            <span class="custom-pill-remove" data-id="${id}">
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </span>
        `;
        
        // Wire up deletion trigger
        pill.querySelector(".custom-pill-remove").addEventListener("click", (e) => {
            e.stopPropagation();
            const index = customScenarios.indexOf(id);
            if (index > -1) {
                customScenarios.splice(index, 1);
            }
            delete modCompatMap[id];
            pill.remove();
        });

        customPillsContainer.appendChild(pill);
        customModInput.value = "";
    });

    customModInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            addCustomModBtn.click();
        }
    });

    // Helper to compare HOI4 game dates (YYYY.MM.DD.HH)
    function compareGameDates(dateA, dateB) {
        if (!dateA || dateA === "Unknown Date") return 1;
        if (!dateB || dateB === "Unknown Date") return -1;
        
        const partsA = dateA.split(".").map(Number);
        const partsB = dateB.split(".").map(Number);
        
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const valA = partsA[i] !== undefined && !isNaN(partsA[i]) ? partsA[i] : 0;
            const valB = partsB[i] !== undefined && !isNaN(partsB[i]) ? partsB[i] : 0;
            if (valA !== valB) {
                return valA - valB;
            }
        }
        return 0;
    }

    // Filter, sort, and display saves list in memory
    function updateSavesDisplay() {
        // 1. Apply Filters
        let filtered = allSaves.filter(save => {
            // Search query filter
            if (activeSearchQuery) {
                const filename = (save.filename || "").toLowerCase();
                const player = (save.player || "").toLowerCase();
                const version = (save.version || "").toLowerCase();
                const date = (save.date || "").toLowerCase();
                const matchesMods = save.mods.some(m => m.toLowerCase().includes(activeSearchQuery));
                if (!filename.includes(activeSearchQuery) &&
                    !player.includes(activeSearchQuery) &&
                    !version.includes(activeSearchQuery) &&
                    !date.includes(activeSearchQuery) &&
                    !matchesMods) {
                    return false;
                }
            }

            // Tab Category filter
            if (activeFilterTab === "vanilla") {
                return save.mods.length === 0;
            } else if (activeFilterTab === "kaiserredux") {
                return save.mods.some(m => m.toLowerCase().includes("kaiserredux"));
            } else if (activeFilterTab === "roadto56") {
                return save.mods.some(m => m.toLowerCase().includes("road to 56") || m.toLowerCase().includes("the road to 56"));
            } else if (activeFilterTab === "mods") {
                if (save.mods.length === 0) return false;
                const isKX = save.mods.some(m => m.toLowerCase().includes("kaiserredux"));
                const isR56 = save.mods.some(m => m.toLowerCase().includes("road to 56") || m.toLowerCase().includes("the road to 56"));
                return !isKX && !isR56;
            }
            return true; // "all"
        });

        // 2. Apply Sorting
        filtered.sort((a, b) => {
            if (activeSortOption === "modified_desc") {
                return b.last_modified.localeCompare(a.last_modified);
            } else if (activeSortOption === "modified_asc") {
                return a.last_modified.localeCompare(b.last_modified);
            } else if (activeSortOption === "gamedate_desc") {
                return compareGameDates(b.date, a.date);
            } else if (activeSortOption === "gamedate_asc") {
                return compareGameDates(a.date, b.date);
            } else if (activeSortOption === "size_desc") {
                return b.size_mb - a.size_mb;
            } else if (activeSortOption === "size_asc") {
                return a.size_mb - b.size_mb;
            } else if (activeSortOption === "country_asc") {
                const valA = a.player || "";
                const valB = b.player || "";
                return valA.localeCompare(valB);
            } else if (activeSortOption === "country_desc") {
                const valA = a.player || "";
                const valB = b.player || "";
                return valB.localeCompare(valA);
            }
            return 0;
        });

        // 3. Render HTML
        if (filtered.length === 0) {
            savesTbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">No saves match the active filter or search criteria.</td>
                </tr>
            `;
            return;
        }

        savesTbody.innerHTML = "";
        filtered.forEach(save => {
            const tr = document.createElement("tr");
            
            // A file is compatible if its version matches the target version
            const isCompatible = save.version.includes(targetGameVersion.split(" ")[0]);
            
            let compBadge = "";
            let actionBtn = "";
            
            if (isCompatible) {
                compBadge = `<span class="badge badge-success">Compatible</span>`;
                actionBtn = ``;
            } else {
                const simpleVer = save.version.split(" v")[1] || save.version;
                compBadge = `<span class="badge badge-warning">Mismatch (${simpleVer.split(" ")[0]})</span>`;
                actionBtn = `<button class="btn btn-primary btn-table start-migration-btn" data-filename="${save.filename}" data-version="${save.version}">Migrate</button>`;
            }
            
            // Add the rollback button if backup exists
            if (save.has_backup) {
                actionBtn += `<button class="btn btn-rollback btn-table rollback-btn" data-filename="${save.filename}">Rollback</button>`;
            }
            
            // Add the validate button
            actionBtn += `<button class="btn btn-validate btn-table validate-save-btn" data-filename="${save.filename}">Validate</button>`;
            
            let modsBadges = "";
            if (save.mods.length > 0) {
                modsBadges = save.mods.map(mod => `<span class="save-mod-badge" title="${mod}">${mod}</span>`).join("");
            } else {
                modsBadges = `<span class="save-mod-badge vanilla">Vanilla / Unknown</span>`;
            }
            
            // Extract version number cleanly (e.g. "v1.18.2" or "1.18.2")
            const verMatch = save.version.match(/v?\d+\.\d+\.\d+(?:\.\d+)?/);
            const displayVersion = verMatch ? verMatch[0] : (save.version.split(" v")[1] || save.version.split(" (")[0]);

            tr.innerHTML = `
                <td>
                    <div class="save-title-row">
                        <span class="save-file-name" title="${save.filename}">${save.filename}</span>
                        <span class="save-size">${save.size_mb} MB</span>
                    </div>
                    <div class="save-modified-date" style="margin-top: 0.2rem; margin-bottom: 0.25rem;">📅 ${save.last_modified}</div>
                    <div class="save-mods-container">
                        ${modsBadges}
                    </div>
                </td>
                <td><span class="text-glow-cyan" style="font-weight: 700;">${save.player}</span></td>
                <td>${save.date}</td>
                <td><span class="save-version-text" title="${save.version}">${displayVersion}</span></td>
                <td>${compBadge}</td>
                <td>
                    <div class="action-container">
                        ${actionBtn}
                    </div>
                </td>
            `;
            
            savesTbody.appendChild(tr);
        });

        // Re-attach event listeners on dynamic elements
        savesTbody.querySelectorAll(".start-migration-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const button = e.currentTarget;
                const filename = button.getAttribute("data-filename");
                const saveVersionRaw = button.getAttribute("data-version");
                
                showConfirmationDialog(filename, saveVersionRaw);
            });
        });

        savesTbody.querySelectorAll(".rollback-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const filename = e.currentTarget.getAttribute("data-filename");
                const proceed = confirm(`Are you sure you want to rollback '${filename}'?\nThis will overwrite it in-place and restore it to its original pre-migration state.`);
                if (proceed) {
                    try {
                        const res = await window.api.rollbackSave(filename);
                        if (res.status === "success") {
                            alert(`Rollback successful! restored backup version for: ${filename}`);
                            fetchSaves();
                        } else {
                            alert(`Failed to rollback: ${res.error}`);
                        }
                    } catch (err) {
                        alert(`Error during rollback: ${err.message}`);
                    }
                }
            });
        });

        savesTbody.querySelectorAll(".validate-save-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const button = e.currentTarget;
                const filename = button.getAttribute("data-filename");
                
                button.disabled = true;
                button.textContent = "Checking...";
                
                migrationStatusText.textContent = "VALIDATING";
                migrationStatusText.className = "status-badge-glow";
                migrationProgressBar.style.width = "50%";
                migrationProgressPercent.textContent = "50%";
                migrationProgressTask.textContent = `Validating save file structure: ${filename}`;
                
                terminalLogs.innerHTML += `\n[${new Date().toLocaleTimeString()}] Running structural integrity checks on: ${filename}...\n`;
                terminalLogs.scrollTop = terminalLogs.scrollHeight;
                
                try {
                    const res = await window.api.validateSave(filename);
                    if (res.status === "success") {
                        migrationStatusText.textContent = "PASSED";
                        migrationStatusText.className = "status-badge-glow success";
                        migrationProgressBar.style.width = "100%";
                        migrationProgressPercent.textContent = "100%";
                        migrationProgressTask.textContent = "Validation PASSED!";
                        terminalLogs.innerHTML += `[${new Date().toLocaleTimeString()}] SUCCESS: ${filename} is structurally valid. ${res.stateCount} states verified.\n`;
                        alert(`Validation PASSED for ${filename}!\nStructure is valid (${res.stateCount} states verified).`);
                    } else {
                        migrationStatusText.textContent = "FAILED";
                        migrationStatusText.className = "status-badge-glow failed";
                        migrationProgressBar.style.width = "100%";
                        migrationProgressPercent.textContent = "100%";
                        migrationProgressTask.textContent = "Validation FAILED!";
                        terminalLogs.innerHTML += `[${new Date().toLocaleTimeString()}] ERROR: Validation failed for ${filename}.\nReason: ${res.error}${res.line ? ` at line ${res.line}` : ''}\n`;
                        alert(`Validation FAILED for ${filename}!\n\nReason: ${res.error}${res.line ? ` (at line ${res.line})` : ''}`);
                    }
                } catch (err) {
                    migrationStatusText.textContent = "FAILED";
                    migrationStatusText.className = "status-badge-glow failed";
                    terminalLogs.innerHTML += `[${new Date().toLocaleTimeString()}] CRITICAL ERROR: ${err.message}\n`;
                    alert(`Error running validation: ${err.message}`);
                } finally {
                    button.disabled = false;
                    button.textContent = "Validate";
                    terminalLogs.scrollTop = terminalLogs.scrollHeight;
                }
            });
        });
    }

    // Fetch status / settings on load
    async function fetchStatus() {
        try {
            const data = await window.api.getStatus();
            
            gameDirInput.value = data.game_dir || "";
            modsRootInput.value = data.mods_root || "";
            saveDirInput.value = data.save_dir || "";
            
            targetGameVersion = data.game_version;
            
            // Format version badge beautifully
            const simpleVer = data.game_version.split(" v")[1] || data.game_version;
            targetVersionBadge.textContent = simpleVer.split(" ")[0];
            targetVersionStr.textContent = data.game_version;
            targetSaveVer.textContent = `${data.target_save_version} (minor: ${data.target_minor_version})`;
            
            if (data.rakaly_found) {
                rakalyStatusBadge.innerHTML = '<span class="badge badge-success">Active</span>';
            } else {
                rakalyStatusBadge.innerHTML = '<span class="badge badge-danger">Not Found</span>';
            }

            // Display mod compatibility status in the left scenario panels
            const kxCompat = data.mods_compat.kaiserredux;
            modCompatMap["kaiserredux"] = kxCompat;
            const compatKaiserredux = document.getElementById("compat-kaiserredux");
            if (kxCompat && compatKaiserredux) {
                compatKaiserredux.textContent = kxCompat.compatible 
                    ? `✓ supports ${kxCompat.supported}` 
                    : `⚠️ Outdated (supports ${kxCompat.supported})`;
                compatKaiserredux.className = `mod-compat-lbl ${kxCompat.compatible ? 'success' : 'danger'}`;
            }

            const r56Compat = data.mods_compat.roadto56;
            modCompatMap["roadto56"] = r56Compat;
            const compatRoadto56 = document.getElementById("compat-roadto56");
            if (r56Compat && compatRoadto56) {
                compatRoadto56.textContent = r56Compat.compatible 
                    ? `✓ supports ${r56Compat.supported}` 
                    : `⚠️ Outdated (supports ${r56Compat.supported})`;
                compatRoadto56.className = `mod-compat-lbl ${r56Compat.compatible ? 'success' : 'danger'}`;
            }
            
            fetchSaves();
        } catch (err) {
            console.error("Error fetching status:", err);
        }
    }

    // Fetch saves list from main process
    async function fetchSaves() {
        savesTbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted">Scanning for save files...</td>
            </tr>
        `;
        
        try {
            const saves = await window.api.getSaves();
            allSaves = saves;
            updateSavesDisplay();
        } catch (err) {
            console.error("Error fetching saves:", err);
            savesTbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-glow-cyan" style="font-weight: 600;">Failed to scan saves. Check directory path mappings.</td>
                </tr>
            `;
        }
    }

    // Custom confirmation modal trigger with mod compatibility warning checklist
    function showConfirmationDialog(filename, saveVersionRaw) {
        confirmFileName.textContent = filename;
        
        const sourceVer = saveVersionRaw.split(" (")[0] || saveVersionRaw;
        const destVer = targetGameVersion.split(" (")[0] || targetGameVersion;
        confirmVersionMap.textContent = `${sourceVer} ➔ ${destVer}`;
        
        // Scan for active mod version compatibility warnings
        const warnings = [];
        if (scenKaiserredux.checked && modCompatMap["kaiserredux"] && !modCompatMap["kaiserredux"].compatible) {
            warnings.push(`KaiserreduX (supports ${modCompatMap["kaiserredux"].supported})`);
        }
        if (scenRoadto56.checked && modCompatMap["roadto56"] && !modCompatMap["roadto56"].compatible) {
            warnings.push(`Road to 56 (supports ${modCompatMap["roadto56"].supported})`);
        }
        customScenarios.forEach(id => {
            if (modCompatMap[id] && !modCompatMap[id].compatible) {
                warnings.push(`Workshop Mod ${id} (supports ${modCompatMap[id].supported})`);
            }
        });
        
        if (warnings.length > 0) {
            confirmWarningText.innerHTML = `The following active mod(s) are not compatible with your current game version (${targetGameVersion.split(" ")[0]}):<br>` + 
                warnings.map(w => `• ${w}`).join("<br>") + 
                `<br><br>It is highly recommended to wait for the mod creator to release a compatible update. Proceeding may result in map or logic glitches.`;
            confirmWarningBox.classList.remove("hidden");
        } else {
            confirmWarningBox.classList.add("hidden");
        }
        
        confirmModalBackdrop.classList.remove("hidden");
        
        confirmOkBtn.onclick = () => {
            confirmModalBackdrop.classList.add("hidden");
            startMigration(filename);
        };
    }

    // Dismiss confirmation dialog
    confirmCancelBtn.addEventListener("click", () => {
        confirmModalBackdrop.classList.add("hidden");
    });

    // Wire up sorting dropdown selector
    savesSortSelect.addEventListener("change", () => {
        activeSortOption = savesSortSelect.value;
        updateSavesDisplay();
    });

    // Wire up category filter tabs
    filterTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            filterTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            activeFilterTab = tab.getAttribute("data-filter");
            updateSavesDisplay();
        });
    });

    // Wire up search bar input
    savesSearchInput.addEventListener("input", () => {
        activeSearchQuery = savesSearchInput.value.toLowerCase().trim();
        updateSavesDisplay();
    });

    // Save Path changes
    savePathsBtn.addEventListener("click", async () => {
        const payload = {
            game_dir: gameDirInput.value,
            mods_root: modsRootInput.value,
            save_dir: saveDirInput.value
        };
        
        try {
            savePathsBtn.textContent = "Applying Configuration...";
            const res = await window.api.savePaths(payload);
            if (res.status === "success") {
                savePathsBtn.textContent = "Overrides Applied!";
                setTimeout(() => {
                    savePathsBtn.textContent = "Apply Directory Overrides";
                }, 1500);
                fetchStatus();
            }
        } catch (err) {
            console.error("Error saving paths:", err);
            savePathsBtn.textContent = "Failed to Apply!";
            setTimeout(() => {
                savePathsBtn.textContent = "Apply Directory Overrides";
            }, 1500);
        }
    });

    // Start Save Migration
    async function startMigration(filename) {
        // Display progress and logs inside the bottom panel (no popup)
        migrationProgressBar.style.width = "0%";
        migrationProgressPercent.textContent = "0%";
        migrationStatusText.textContent = "PROCESSING";
        migrationStatusText.className = "status-badge-glow";
        migrationProgressTask.textContent = "Initializing mapping alignment modules...";
        
        terminalLogs.innerHTML = `[00:00:00] Initializing desktop mapping repair module...
[00:00:00] Target File: ${filename}
`;
        
        const scenarios = getSelectedScenarios();
        
        try {
            await window.api.migrateSave(filename, {
                scenarios: scenarios,
                adjust_states: true
            });
        } catch (err) {
            console.error("Error triggering migration:", err);
            migrationStatusText.textContent = "FAILED";
            migrationStatusText.className = "status-badge-glow failed";
            migrationProgressTask.textContent = "Migration failed.";
            terminalLogs.innerHTML += "[00:00:00] CRITICAL ERROR: " + err.message + "\n";
        }
    }

    // IPC Logger and Progress Listeners
    window.api.onMigrationLog((log) => {
        terminalLogs.innerHTML += log + "\n";
        terminalLogs.scrollTop = terminalLogs.scrollHeight;
    });

    window.api.onMigrationProgress((percent) => {
        migrationProgressBar.style.width = `${percent}%`;
        migrationProgressPercent.textContent = `${percent}%`;
        if (percent > 10 && percent < 40) {
            migrationProgressTask.textContent = "Executing engine plain-text melting...";
        } else if (percent >= 40 && percent < 60) {
            migrationProgressTask.textContent = "Rewriting target header versions...";
        } else if (percent >= 60 && percent < 85) {
            migrationProgressTask.textContent = "Re-aligning state coordinates database...";
        } else if (percent >= 85 && percent < 100) {
            migrationProgressTask.textContent = "Writing save database files back in-place...";
        } else if (percent === 100) {
            migrationProgressTask.textContent = "Repair completed successfully!";
        }
    });

    window.api.onMigrationStatus((status) => {
        if (status === "success") {
            migrationStatusText.textContent = "SUCCESS";
            migrationStatusText.className = "status-badge-glow success";
            fetchSaves(); // Refresh saves list to show updated version and Rollback button
        } else if (status === "failed") {
            migrationStatusText.textContent = "FAILED";
            migrationStatusText.className = "status-badge-glow failed";
        } else {
            migrationStatusText.textContent = "PROCESSING";
            migrationStatusText.className = "status-badge-glow";
        }
    });
    
    refreshSavesBtn.addEventListener("click", fetchSaves);

    // Initial Status Check
    fetchStatus();
});
