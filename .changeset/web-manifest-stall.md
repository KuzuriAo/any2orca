---
"any2orca": patch
---

**A partner link whose download stalls stops after 60 seconds, and you can cancel it.** When a site's `?manifest=` link points to a server that stops sending, the web app used to wait forever; it now stops after 60 seconds with nothing received and says so, and a Cancel button stops the download at any time and returns to the start screen. Converted files don't change.
