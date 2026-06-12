# HOI4 Save Game Migrator

A Windows desktop tool for repairing and migrating Hearts of Iron IV save games after base game or workshop mod updates break compatibility.

## Download For Windows

Download the ready-to-use package from the GitHub Releases page:

https://github.com/rayngnpc/hoi4-savegame-migrator/releases

Use the file named:

```text
HOI4_Save_Migrator-win32-x64.zip
```

## How To Use

1. Download `HOI4_Save_Migrator-win32-x64.zip` from Releases.
2. Right-click the zip file and choose `Extract All`.
3. Open the extracted `HOI4_Save_Migrator-win32-x64` folder.
4. Double-click `HOI4_Save_Migrator.exe`.
5. Select your Hearts of Iron IV save folder when the app opens.
6. Choose a save file, review the compatibility warnings, then run the migration.

Keep the extracted folder together. Do not move only `HOI4_Save_Migrator.exe` by itself, because the app needs the files beside it.

## What It Does

- Reads local Hearts of Iron IV save games.
- Converts supported binary saves to editable text through the bundled Rakaly engine.
- Checks save structure before replacing files.
- Creates `.bak` backups before migration.
- Warns about active mod compatibility where possible.
- Supports sorting, searching, and filtering large save folders.

## Important Notes

This tool edits save files, so keep backups of important campaigns. The app creates backup files automatically, but copying your most important saves somewhere safe is still recommended.

The current packaged download is for Windows x64.

## For Developers

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm start
```

Run tests:

```bash
npm test
```

Build the Windows portable package:

```bash
npm run package-win
```

## License

Distributed under the MIT License.
