# Hearts of Iron IV — Save Game Migrator & Repair Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Platform: Windows x64](https://img.shields.io/badge/Platform-Windows%20x64-brightgreen.svg)](#download-for-windows)
[![Download: GitHub Releases](https://img.shields.io/badge/Download-GitHub%20Releases-orange.svg)](https://github.com/rayngnpc/hoi4-savegame-migrator/releases)

A premium Windows desktop utility built to save broken Hearts of Iron IV save game files from version mismatches and coordinate misalignments caused by base game or workshop mod updates.

---

## 📦 Download For Windows

Download the ready-to-use portable package from the GitHub Releases page:

https://github.com/rayngnpc/hoi4-savegame-migrator/releases

Use this file:

```text
HOI4_Save_Migrator-win32-x64.zip
```

### How To Run It

1. Download `HOI4_Save_Migrator-win32-x64.zip`.
2. Right-click the zip file and choose `Extract All`.
3. Open the extracted `HOI4_Save_Migrator-win32-x64` folder.
4. Double-click `HOI4_Save_Migrator.exe`.
5. Select your Hearts of Iron IV save folder when the app opens.
6. Choose a save file, review the compatibility warnings, then run the migration.

> [!IMPORTANT]
> Keep the extracted folder together. Do not move only `HOI4_Save_Migrator.exe` by itself, because the app needs the files beside it.

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

## 🛡️ Save Safety

This tool edits save files, so keep backups of important campaigns. The app creates `.bak` files automatically before migration, but copying your most important saves somewhere safe is still recommended.

---

## 🛠️ For Developers

### Installation

```bash
npm install
```

### Running Locally

```bash
npm start
```

### Running Tests

```bash
npm test
```

### Packaging The Windows App

```bash
npm run package-win
```

---

## ⚖️ License

Distributed under the MIT License.
