---
"any2orca": patch
---

Other: **A Dockerfile for hosting the web app yourself.** `examples/self-hosting` gains a Dockerfile that builds the web app from the repository and serves it with the example's own nginx config, so a container has the same security headers, caching and 404 as the nginx and Apache configs there. Its tests check it against the repository on every run and, when asked for, build the image, run it and put the same header checks to the real web app. `docs/run-the-web-app.md` shows the two commands.
