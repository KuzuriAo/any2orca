# Batch script

Convert a whole folder of 3MF projects to Snapmaker U1 from a Node script. It is what `any2orca convert ./models/*.3mf` does, written out so you can adapt it into your own tooling.

[`convert-all.mjs`](convert-all.mjs) is about 50 lines, with no build step.

## Run it

From the repository root:

```sh
npm install
npm run start -w @any2orca/example-batch-script -- ./my-models
```

`@any2orca/example-batch-script` is this folder's name in the repository's workspaces, not a package on npm. Paths are read from where you run the command.

**No projects handy?** Try it with the repository's demo model first:

```sh
mkdir my-models
cp apps/web/public/demo-model.3mf my-models/
```

Any Bambu Studio, Creality Print, Anycubic Slicer Next, ElegooSlicer or Flash Studio project works the same way; a model downloaded from MakerWorld is a good real test. (`mkdir` and `cp` work as shown in PowerShell too.)

Every `.3mf` in `./my-models` is converted into `./my-models/converted/<name>_U1.3mf`. Pass a second argument to choose the output folder. Nothing is sent anywhere: the script uses the profile catalog installed with `any2orca-profiles` and never touches the network.

Example output:

```
FAILED  broken.3mf  [invalid_file] This file can't be read as a 3MF project: it isn't a complete zip archive (a .3mf is one). It may be damaged or only partly downloaded; download it again.
ok      demo-model.3mf  ->  snapmaker-u1-0.4-standard  (2 plate(s), 3 filament(s))

1 converted, 1 failed. Output: <the full path of the output folder>
```

When a conversion has notes worth reading (for example, objects moved closer together to fit the U1's bed), they print under the file as `note: ...` lines.

## The same thing from the command line

```sh
any2orca convert "./my-models/*.3mf" --out-dir ./my-models/converted
```

The command expands `*` and `?` in the file name itself, so the same line works in Command Prompt and PowerShell, which leave wildcards for the program, and in a Unix shell, which expands them first. Wildcards work in the file name only, never in folder names or subfolders, and a pattern that matches nothing is an error.

The exit code is `0` when every file converted, `1` when any failed, and `2` for a usage error, so the script can sit in a build step or a scheduled job.

## What to change

- **Use it in your own project.** `npm install any2orca any2orca-profiles`, then copy the script. Everything it imports is public API.
- **Choose the profile.** By default each file picks its own profile from its settings. To force one for every file, pass `profileId` to `convert()`; `listProfiles()` shows the choices.
- **High flow hotends, filament naming and the version note** are options on the same `convert()` call. See [the options](../../packages/core/README.md).
- **Very large projects.** Pass `maxUnpackedBytes` to `convert()` to raise the 2 GB unpacked limit (up to 16 GB) for projects that need it; converting needs about twice that much memory.
- **Show your own messages.** A failed conversion throws an `Any2orcaError` with a stable `code` (`invalid_file`, `too_large`, `invalid_project`, `profile_not_found`, `profile_data`), so you can branch on it instead of matching message text.
- **Run files in parallel.** The script converts one file at a time, which keeps memory flat. For many large files, run a few at a time in a `Promise.all` over chunks, or use worker threads. The catalog is safe to share.

## Check it

```sh
npm test -w @any2orca/example-batch-script
```

The test runs the script on a sample project and a corrupt file, and checks the output and the exit codes.

## License

MIT, like the library. Copy any of it into your own project.
