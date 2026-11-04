---
"any2orca": patch
---

**Large projects convert about twice as fast.** The output zip is now written at deflate level 6 instead of 9: on a 102.6 MB real project, 57.8 seconds became 30.3 (the same laptop, the command line), and the file grew by 0.2% (107,327,470 to 107,532,939 bytes). Level 9 spent three fifths of the whole conversion recompressing mesh files the conversion never changes. Every entry in the converted file has the same content as before, byte for byte; only the zip container's bytes differ, so a hash of the whole file changes. The output is still the same for the same input and options.
