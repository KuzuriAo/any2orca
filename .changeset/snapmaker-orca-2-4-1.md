---
"any2orca": minor
"any2orca-profiles": minor
---

Output-affecting: **Snapmaker Orca 2.4.1's U1 profiles are added and are now the default.** Files converted without choosing a release are made for 2.4.1: Snapmaker's 2.4.1 stock values, its 16 new settings (color penetration depth, support transition and prime tower interface options, first-layer travel acceleration and jerk, filament adhesiveness), and the `Snapmaker_Orca-2.4.1` version line. A color penetration depth deeper than the shell has layers is lowered to fit, as Snapmaker Orca 2.4.1 does when opening the file, so it shows no warning. To keep converting for 2.4.0, pass `--snapmaker-orca-version 2.4.0` (or `snapmakerOrcaVersion: "2.4.0"`), or pick it in the web app. A preset's values are now checked against the limits both releases accept, so `support_threshold_angle` must be at least 1 (2.4.1's minimum) and `raft_first_layer_expansion` at least 0 (2.4.0's).
