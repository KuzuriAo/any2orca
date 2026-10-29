# Output stamp

Every file any2orca converts gets one small extra entry, `Metadata/any2orca.json`. This page says what it is, why it is there, and how to leave it out.

## What it is

A few lines of text inside the converted `.3mf` (a 3MF is a zip file), naming the any2orca version that made it, the profile catalog it used, which profile, and the options you chose. This is all of it:

```json
{
  "stamp": 1,
  "generator": "any2orca",
  "version": "0.1.0",
  "profiles": {
    "version": "0.1.0",
    "tracks": "Snapmaker Orca 2.4.0"
  },
  "profileId": "snapmaker-u1-0.4-standard",
  "options": {
    "highFlowHotends": false,
    "hardenedNozzles": false,
    "filamentComplianceMode": null
  }
}
```

| Field | Meaning |
|---|---|
| `stamp` | Format version. Stays `1` as long as fields are only added. |
| `generator` | Always `"any2orca"`. |
| `version` | The `any2orca` version that converted the file. Matches a `CHANGELOG.md` entry. |
| `profiles.version` | The profile catalog's version (`any2orca-profiles` for the bundled catalog). |
| `profiles.tracks` | The upstream slicer release the catalog follows. |
| `profileId` | The profile used (after any retired-id substitution). |
| `options` | The conversion options chosen. |
| `options.highFlowHotends` | Which toolheads have the Liber High Flow Hotend: `false` for none, or one entry per toolhead, T1 first, e.g. `[true, false, false, false]`. Readers also accept a plain `true`, meaning all four. |
| `options.hardenedNozzles` | `true` when the file was converted for hardened steel nozzles instead of the stock stainless steel 0.4. Older notes without it mean `false`. |
| `options.filamentComplianceMode` | `"generic"`, `"snapmaker"`, or `null` when the source file's filament names were kept. |
| `options.aboveStock` | Only when you chose differently for values above stock: `{ "keep": [...], "stock": [...] }`, the settings kept at the creator's value and the ones set to Snapmaker's stock value. |
| `options.preset` | Only when the file was converted with a [preset](presets.md): `{ "base": "<profile id>", "keys": ["<setting>", ...], "sha256": "<fingerprint>" }`, the preset's base profile, the settings it set, and a SHA-256 of their values (the sorted `[key, value]` pairs as JSON). Never the preset's name. |

## How to read it from a file

A `.3mf` is a zip file, and the note is one entry in it, `Metadata/any2orca.json`. To see what a file carries:

- **macOS or Linux:** `unzip -p model_U1.3mf Metadata/any2orca.json` prints it. Add `| python3 -m json.tool` for tidier output. `unzip -l model_U1.3mf | grep any2orca` tells you whether the file has the entry at all.
- **Any system with Python:** `python3 -c "import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read('Metadata/any2orca.json').decode())" model_U1.3mf`
- **Windows or by hand:** copy the file, rename the copy to `model_U1.zip`, open it with your system's zip tool (or 7-Zip), open the `Metadata` folder, and open `any2orca.json` in a text editor. PowerShell can also read it: `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z = [IO.Compression.ZipFile]::OpenRead("$PWD\model_U1.3mf"); (New-Object IO.StreamReader($z.GetEntry("Metadata/any2orca.json").Open())).ReadToEnd(); $z.Dispose()`
- **In code:** `decodeStamp()` from the `any2orca` package reads the entry's bytes back, and returns `null` if there's none or it can't be read. [`examples/read-stamp`](../examples/read-stamp) reads it from every file in a folder and finds files made before a given release.

A file with no `Metadata/any2orca.json` was converted without the note, or didn't come from any2orca. The note says nothing about your model; it's safe to paste into a bug report.

## Why it is there

- **So a bad file can be recognized later.** When a bug is found and fixed, the version inside a file tells you whether it was made by an affected release. For example, some earlier conversions produced files that Snapmaker Orca 2.4.0 refused to open; with the note you can check the version and re-convert, and without it nothing in the file tells you.
- **So a bug report is precise.** The version, profile catalog and options are exactly what is needed to reproduce a problem, with no guessing. See [If you report a bug](#if-you-report-a-bug) below.
- **It is for people, and for tools that choose to read it.** Nothing in any2orca reads it back by itself, and nothing is sent anywhere. It never leaves the file.

## If you report a bug

If a converted file misbehaves and you open an issue, the note tells me exactly which release, profile catalog and options produced it, so I can reproduce the problem instead of guessing. You don't need to attach your model for that. The note is tiny and holds nothing about your model, so you can paste it into the issue on its own:

```
unzip -p converted-file.3mf Metadata/any2orca.json
```

(Any zip tool can open the file and show you `Metadata/any2orca.json` too.) If I need the project itself, I'll ask, and sharing it is always your choice.

If you left the note out, the issue form still asks for the version and your source project's details; that is usually enough to start.

## What it never contains

File names, paths, times, user or machine identifiers, or anything from your model or its settings.

## How to leave it out

- **Web app:** untick **Add a version note to the file** before converting.
- **Command line:** `any2orca convert model.3mf --no-stamp`.
- **Library:** pass `stamp: false` to `convert()`.
- **After the fact:** delete the `Metadata/any2orca.json` entry with any zip tool. Nothing else in the file refers to it.

The file opens and prints the same either way. Snapmaker Orca ignores the entry, and a converted file with the note in it uploaded to Snapmaker Space without complaint when I tried it. If some tool ever rejects a file because of it, convert with the note left out and let me know.

## Will the format change?

Files with this note already exist, and other tools may read it, so any2orca only adds to it. A new release may add a field, and readers ignore fields they don't know (`decodeStamp()` does), so older tools keep working. A field that's already there never changes its name or its meaning. If that ever had to happen, the note's `stamp` number would go from 1 to 2, so a reader can tell the two apart.

The note lives in its own entry, so no file a slicer reads and no mesh data changes because of it.
