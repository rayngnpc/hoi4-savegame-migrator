const assert = require('assert');
const fs = require('fs');
const path = require('path');
const validator = require('../validator');

const fixturesDir = path.join(__dirname, 'fixtures');

console.log('--- Running Validator Unit Tests ---');

// Test Case 1: test_balanced_braces_pass
(function test_balanced_braces_pass() {
    console.log('Running: test_balanced_braces_pass...');
    const content = fs.readFileSync(path.join(fixturesDir, 'minimal_valid.hoi4'), 'utf8');
    const result = validator.checkBraceBalance(content);
    assert.strictEqual(result.valid, true, 'minimal_valid.hoi4 should have balanced braces');
})();

// Test Case 2: test_unbalanced_braces_fail
(function test_unbalanced_braces_fail() {
    console.log('Running: test_unbalanced_braces_fail...');
    const content = fs.readFileSync(path.join(fixturesDir, 'missing_closing_brace.hoi4'), 'utf8');
    const result = validator.checkBraceBalance(content);
    assert.strictEqual(result.valid, false, 'missing_closing_brace.hoi4 should be unbalanced');
    assert.ok(result.errorMsg.includes('Unmatched opening brace') || result.errorMsg.includes('Extra closing brace'), 'Should specify brace error');
})();

// Test Case 3: test_quoted_braces_ignored
(function test_quoted_braces_ignored() {
    console.log('Running: test_quoted_braces_ignored...');
    const content = fs.readFileSync(path.join(fixturesDir, 'quoted_braces.hoi4'), 'utf8');
    const result = validator.checkBraceBalance(content);
    assert.strictEqual(result.valid, true, 'quoted_braces.hoi4 should have balanced braces even with braces in quotes');
})();

// Test Case 4: test_root_blocks_check
(function test_root_blocks_check() {
    console.log('Running: test_root_blocks_check...');
    const content = fs.readFileSync(path.join(fixturesDir, 'minimal_valid.hoi4'), 'utf8');
    const result = validator.checkRootBlocks(content);
    assert.strictEqual(result.valid, true, 'minimal_valid.hoi4 should have all root blocks');
    
    const badContent = 'player="FRA"\nversion="v1.19.0"';
    const badResult = validator.checkRootBlocks(badContent);
    assert.strictEqual(badResult.valid, false, 'Missing blocks should be flagged');
})();

// Test Case 5: test_orphan_state_id_detected
(function test_orphan_state_id_detected() {
    console.log('Running: test_orphan_state_id_detected...');
    const content = fs.readFileSync(path.join(fixturesDir, 'orphan_state.hoi4'), 'utf8');
    const result = validator.checkStatesBlockIntegrity(content);
    assert.strictEqual(result.valid, false, 'orphan_state.hoi4 should fail because of leaked state ID');
    assert.ok(result.errorMsg.includes('Orphaned/leaked state block'), 'Error should mention orphaned/leaked state block');
})();

// Test Case 6: test_version_header_valid
(function test_version_header_valid() {
    console.log('Running: test_version_header_valid...');
    const content = fs.readFileSync(path.join(fixturesDir, 'minimal_valid.hoi4'), 'utf8');
    const result = validator.checkVersionHeaders(content, 'v1.19.0', 33, 0);
    assert.strictEqual(result.valid, true, 'Headers should match exactly');
})();

// Test Case 7: test_version_header_mismatch
(function test_version_header_mismatch() {
    console.log('Running: test_version_header_mismatch...');
    const content = fs.readFileSync(path.join(fixturesDir, 'minimal_valid.hoi4'), 'utf8');
    const result = validator.checkVersionHeaders(content, 'v1.18.0', 33, 0);
    assert.strictEqual(result.valid, false, 'Headers mismatch should be flagged');
})();

// Test Case 8: test_truncated_file_detected
(function test_truncated_file_detected() {
    console.log('Running: test_truncated_file_detected...');
    const result = validator.checkFileSizeSanity(1000, 800);
    assert.strictEqual(result.valid, false, '20% shrinkage should be flagged');
    
    const passResult = validator.checkFileSizeSanity(1000, 950);
    assert.strictEqual(passResult.valid, true, '5% shrinkage should pass');
})();

// Test Case 9: test_nested_states_keyword
(function test_nested_states_keyword() {
    console.log('Running: test_nested_states_keyword...');
    const content = fs.readFileSync(path.join(fixturesDir, 'nested_states_keyword.hoi4'), 'utf8');
    const result = validator.checkStatesBlockIntegrity(content);
    assert.strictEqual(result.valid, true, 'Nested states keyword should not break state integrity check');
})();

// Test Case 10: test_large_states_block
(function test_large_states_block() {
    console.log('Running: test_large_states_block...');
    const content = fs.readFileSync(path.join(fixturesDir, 'large_states_block.hoi4'), 'utf8');
    const result = validator.checkStatesBlockIntegrity(content, 50);
    assert.strictEqual(result.valid, true, '50 states should parse correctly');
    assert.strictEqual(result.stateCount, 50, 'State count should be exactly 50');
})();

console.log('ALL VALIDATOR TESTS PASSED SUCCESSFULLY!\n');
