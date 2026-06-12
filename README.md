# Hearts of Iron IV — Save Game Migrator & Repair Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Platform: Windows | macOS | Linux](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen.svg)](#)

A premium desktop utility built to save broken Hearts of Iron IV save game files from version mismatches and coordinate misalignments caused by base game or workshop mod updates.

---

## 📖 The Backstory

> "I play Hearts of Iron IV with my friends every weekend, but we only have a few hours of free time to play together. In reality, a single campaign can stretch over several months. Unfortunately, whenever the game or one of our active mods updates, our save games break and become completely unusable. It pissed me off so much that I had to build this tool to fix our saves so we could finally continue our campaigns.
>
> Because of the sheer number of mods, custom map scenarios, and potential future game updates, it is impossible to test every single combination. This tool isn't guaranteed to be 100% compatible with every scenario, but my hope is that it keeps our saves alive and I don't have to come back to maintain this repository too often. I hope it serves you well and lasts as long as the game itself remains active!"

---

## ⚡ Key Features

* **🚀 Melter Engine Integration**: Integrates directly with native melting binaries for lightning-fast plain-text translation of binary Paradox saves.
* **⚠️ Mod Version Compatibility Guard**: 
  * Automatically scans Paradox `descriptor.mod` files inside Steam Workshop directories.
  * Queries and displays version compatibility (supporting wildcards like `1.18.*`) under active map scenario pills.
  * Alerts you with warnings inside the confirmation dialog if you try to migrate a save with outdated active mods.
* **📊 Enterprise Grid Navigation**:
  * **Sort Controls**: Sort your save game library by File Modification Date, Game Date (custom chronology sorting), File Size, or Player Country Tag.
  * **Category Filter Tabs**: Group saves dynamically by `All Saves`, `Vanilla`, `KaiserreduX`, `Road to 56`, and `Other Mods`.
  * **Reactive Search**: Instantly filters files in real-time as you type, integrated alongside the active category tab and sort option.
* **🛡️ Structural Integrity Validation**:
  * Balanced braces scanner (ignores braces inside comments `#` and quoted strings).
  * Root block presence assertions (`player`, `date`, `version`, `save_version`, `states`).
  * Orphaned state ID prevention (guarantees states are not leaked outside of the `states = {}` parent block).
* **🔄 Safe Atomic Operations**: Writes output atomically to temporary files and validates structural integrity before overwriting. Automatically creates backups (`.bak`) allowing instant risk-free rollbacks.

---

## 🛠️ Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v16.0 or higher recommended)
* NPM

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/rayngnpc/hoi4-savegame-migrator.git
   cd hoi4-savegame-migrator
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
To launch the desktop application in development mode:
```bash
npm start
```

### Running Tests
To run the full suite of unit, integration, and real-saves validation tests:
```bash
# Run unit and integration tests
npm test

# Run smoke tests on your local save game files
npm run test:real
```

### Packaging the Application
To build a standalone Windows executable (`HOI4_Save_Migrator.exe`) with the custom app icon compiled into the binary resources:
```bash
npm run package-win
```

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for details.
