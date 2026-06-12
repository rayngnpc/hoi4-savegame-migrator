const fs = require('fs');

/**
 * Checks if curly braces are balanced.
 * Returns { valid: true } or { valid: false, errorLine, errorCol, errorMsg }
 */
function checkBraceBalance(content) {
    let braceDepth = 0;
    let inString = false;
    let inComment = false;
    let line = 1;
    let col = 1;
    const stack = [];
    const len = content.length;

    for (let i = 0; i < len; i++) {
        const char = content[i];

        if (char === '\n') {
            line++;
            col = 1;
        } else {
            col++;
        }

        if (inComment) {
            if (char === '\n') {
                inComment = false;
            }
            continue;
        }

        if (inString) {
            if (char === '\\') {
                i++;
                if (i < len) {
                    if (content[i] === '\n') {
                        line++;
                        col = 1;
                    } else {
                        col++;
                    }
                }
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '#') {
            inComment = true;
        } else if (char === '"') {
            inString = true;
        } else if (char === '{') {
            braceDepth++;
            stack.push({ line, col, index: i });
        } else if (char === '}') {
            braceDepth--;
            if (braceDepth < 0) {
                return {
                    valid: false,
                    errorLine: line,
                    errorCol: col,
                    errorMsg: `Extra closing brace '}' at line ${line}, column ${col}`
                };
            }
            stack.pop();
        }
    }

    if (braceDepth > 0) {
        const lastOpen = stack.pop();
        return {
            valid: false,
            errorLine: lastOpen.line,
            errorCol: lastOpen.col,
            errorMsg: `Unmatched opening brace '{' at line ${lastOpen.line}, column ${lastOpen.col}`
        };
    }

    return { valid: true };
}

/**
 * Checks that required top-level blocks exist.
 */
function checkRootBlocks(content) {
    const required = [
        { name: 'player', regex: /^player=/m },
        { name: 'date', regex: /^date=/m },
        { name: 'version', regex: /^version=/m },
        { name: 'save_version', regex: /^save_version=/m },
        { name: 'states', regex: /^states=\{[ \t]*$/m }
    ];

    for (const req of required) {
        if (!req.regex.test(content)) {
            return {
                valid: false,
                errorMsg: `Missing required root-level block/key: '${req.name}'`
            };
        }
    }
    return { valid: true };
}

/**
 * Validates version headers.
 */
function checkVersionHeaders(content, targetVersion, targetSaveVer, targetMinorVer) {
    const verMatch = content.match(/^version="([^"]*)"/m);
    if (!verMatch) {
        return { valid: false, errorMsg: "Missing version header in file content" };
    }
    if (targetVersion && verMatch[1] !== targetVersion) {
        return { valid: false, errorMsg: `Version header mismatch: expected "${targetVersion}", found "${verMatch[1]}"` };
    }

    const svMatch = content.match(/^save_version=(\d+)/m);
    if (!svMatch) {
        return { valid: false, errorMsg: "Missing save_version header" };
    }
    if (targetSaveVer !== undefined && parseInt(svMatch[1]) !== targetSaveVer) {
        return { valid: false, errorMsg: `save_version mismatch: expected ${targetSaveVer}, found ${svMatch[1]}` };
    }

    const msvMatch = content.match(/^minor_save_version=(\d+)/m);
    if (msvMatch && targetMinorVer !== undefined && parseInt(msvMatch[1]) !== targetMinorVer) {
        return { valid: false, errorMsg: `minor_save_version mismatch: expected ${targetMinorVer}, found ${msvMatch[1]}` };
    }

    return { valid: true };
}

/**
 * Checks that output file size is sane compared to original.
 */
function checkFileSizeSanity(originalSize, newSize) {
    if (originalSize <= 0) return { valid: true };
    const ratio = newSize / originalSize;
    if (ratio < 0.90) {
        return {
            valid: false,
            errorMsg: `File size sanity check failed: migrated file is ${(ratio * 100).toFixed(1)}% of original size (shrunk by > 10%). Possible truncation.`
        };
    }
    return { valid: true };
}

/**
 * Deep check of states block integrity.
 * Verifies that:
 * 1. Inside states={}, every key at depth 1 is a valid integer.
 * 2. No integer keys (orphan states) exist at root level (depth 0).
 * 3. The count of states matches expectedCount (if provided).
 */
function checkStatesBlockIntegrity(content, expectedCount) {
    let inString = false;
    let inComment = false;
    let braceDepth = 0;
    const len = content.length;
    
    let statesStartIdx = -1;
    let statesEndIdx = -1;
    
    let i = 0;
    while (i < len) {
        const char = content[i];
        if (inComment) {
            if (char === '\n') inComment = false;
            i++;
            continue;
        }
        if (inString) {
            if (char === '\\') {
                i += 2;
            } else {
                if (char === '"') inString = false;
                i++;
            }
            continue;
        }
        if (char === '#') {
            inComment = true;
            i++;
            continue;
        }
        if (char === '"') {
            inString = true;
            i++;
            continue;
        }
        
        if (char === '{') {
            braceDepth++;
        } else if (char === '}') {
            braceDepth--;
        } else if (braceDepth === 0) {
            if (content.startsWith('states', i)) {
                let j = i + 6;
                while (j < len && /\s/.test(content[j])) j++;
                if (content[j] === '=') {
                    j++;
                    while (j < len && /\s/.test(content[j])) j++;
                    if (content[j] === '{') {
                        statesStartIdx = j;
                        break;
                    }
                }
            }
        }
        i++;
    }

    if (statesStartIdx === -1) {
        return { valid: false, errorMsg: "Could not find root-level 'states={'" };
    }

    let depth = 1;
    let j = statesStartIdx + 1;
    inString = false;
    inComment = false;
    
    while (j < len && depth > 0) {
        const char = content[j];
        if (inComment) {
            if (char === '\n') inComment = false;
            j++;
            continue;
        }
        if (inString) {
            if (char === '\\') {
                j += 2;
            } else {
                if (char === '"') inString = false;
                j++;
            }
            continue;
        }
        if (char === '#') {
            inComment = true;
            j++;
            continue;
        }
        if (char === '"') {
            inString = true;
            j++;
            continue;
        }

        if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                statesEndIdx = j;
                break;
            }
        }
        j++;
    }

    if (statesEndIdx === -1) {
        return { valid: false, errorMsg: "Unclosed 'states={}' block" };
    }

    const statesBlockContent = content.substring(statesStartIdx + 1, statesEndIdx);
    const stateIds = [];
    
    let sLen = statesBlockContent.length;
    let sDepth = 0;
    inString = false;
    inComment = false;
    let token = '';
    
    let k = 0;
    while (k < sLen) {
        const char = statesBlockContent[k];
        if (inComment) {
            if (char === '\n') {
                inComment = false;
                token = '';
            }
            k++;
            continue;
        }
        if (inString) {
            if (char === '\\') {
                k += 2;
            } else {
                if (char === '"') inString = false;
                k++;
            }
            continue;
        }
        if (char === '#') {
            inComment = true;
            token = '';
            k++;
            continue;
        }
        if (char === '"') {
            inString = true;
            token = '';
            k++;
            continue;
        }

        if (char === '{') {
            sDepth++;
            if (sDepth === 1) {
                const cleanToken = token.trim();
                let keyStr = cleanToken;
                if (keyStr.endsWith('=')) {
                    keyStr = keyStr.substring(0, keyStr.length - 1).trim();
                }
                const id = parseInt(keyStr);
                if (isNaN(id) || id <= 0 || !/^\d+$/.test(keyStr)) {
                    return {
                        valid: false,
                        errorMsg: `Invalid state identifier inside states block: '${keyStr}'`
                    };
                }
                stateIds.push(id);
                token = '';
            }
        } else if (char === '}') {
            sDepth--;
        } else if (sDepth === 0) {
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
        k++;
    }

    if (expectedCount !== undefined && expectedCount > 0) {
        if (stateIds.length !== expectedCount) {
            return {
                valid: false,
                errorMsg: `States count mismatch: expected ${expectedCount} states, found ${stateIds.length} states in migrated save.`
            };
        }
    }

    let fileDepth = 0;
    inString = false;
    inComment = false;
    let rootToken = '';
    
    let p = 0;
    while (p < len) {
        if (p === statesStartIdx) {
            p = statesEndIdx + 1;
            fileDepth = 0;
            rootToken = '';
            continue;
        }
        if (p >= len) break;
        
        const char = content[p];
        if (inComment) {
            if (char === '\n') {
                inComment = false;
                rootToken = '';
            }
            p++;
            continue;
        }
        if (inString) {
            if (char === '\\') {
                p += 2;
            } else {
                if (char === '"') inString = false;
                p++;
            }
            continue;
        }
        if (char === '#') {
            inComment = true;
            rootToken = '';
            p++;
            continue;
        }
        if (char === '"') {
            inString = true;
            rootToken = '';
            p++;
            continue;
        }

        if (char === '{') {
            fileDepth++;
            if (fileDepth === 1) {
                const cleanToken = rootToken.trim();
                let keyStr = cleanToken;
                if (keyStr.endsWith('=')) {
                    keyStr = keyStr.substring(0, keyStr.length - 1).trim();
                }
                const num = parseInt(keyStr);
                if (!isNaN(num) && num > 0 && /^\d+$/.test(keyStr)) {
                    let line = 1;
                    for (let x = 0; x < p; x++) {
                        if (content[x] === '\n') line++;
                    }
                    return {
                        valid: false,
                        errorMsg: `Orphaned/leaked state block '${keyStr}={' found outside 'states={}' at line ${line}`
                    };
                }
                rootToken = '';
            }
        } else if (char === '}') {
            fileDepth--;
        } else if (fileDepth === 0) {
            if (char === '\n') {
                if (!rootToken.includes('=')) {
                    rootToken = '';
                }
            } else if (!/\s/.test(char)) {
                rootToken += char;
            } else {
                if (rootToken.length > 0 && !rootToken.endsWith('=')) {
                    rootToken += char;
                }
            }
        }
        p++;
    }

    return { valid: true, stateCount: stateIds.length };
}

/**
 * Validates a file before migration.
 */
function validatePreMigration(content) {
    const braceCheck = checkBraceBalance(content);
    if (!braceCheck.valid) return braceCheck;

    const rootCheck = checkRootBlocks(content);
    if (!rootCheck.valid) return rootCheck;

    const statesCheck = checkStatesBlockIntegrity(content);
    if (!statesCheck.valid) return statesCheck;

    return { valid: true, stateCount: statesCheck.stateCount };
}

/**
 * Validates a file after migration.
 */
function validatePostMigration(content, expectedStatesCount, originalSize, targetVersion, targetSaveVer, targetMinorVer) {
    const braceCheck = checkBraceBalance(content);
    if (!braceCheck.valid) return braceCheck;

    const rootCheck = checkRootBlocks(content);
    if (!rootCheck.valid) return rootCheck;

    const versionCheck = checkVersionHeaders(content, targetVersion, targetSaveVer, targetMinorVer);
    if (!versionCheck.valid) return versionCheck;

    if (originalSize !== undefined && originalSize > 0) {
        const sizeCheck = checkFileSizeSanity(originalSize, content.length);
        if (!sizeCheck.valid) return sizeCheck;
    }

    const statesCheck = checkStatesBlockIntegrity(content, expectedStatesCount);
    if (!statesCheck.valid) return statesCheck;

    return { valid: true, stateCount: statesCheck.stateCount };
}

module.exports = {
    checkBraceBalance,
    checkRootBlocks,
    checkVersionHeaders,
    checkFileSizeSanity,
    checkStatesBlockIntegrity,
    validatePreMigration,
    validatePostMigration
};
