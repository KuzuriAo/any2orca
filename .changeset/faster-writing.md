---
"any2orca": patch
---

Other: **Converted files are written in about half the time.** The output is compressed at deflate level 3 instead of 6: on a sample of 192 real projects that wrote in 51% of the time, for files 1.7% larger. On a 1.4 GB project, compression was about 50 s of a 75 s conversion. Every file inside the converted project is unchanged; only the zip's compressed bytes differ, and Snapmaker Orca opens it the same way.
