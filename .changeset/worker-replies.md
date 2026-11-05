---
"any2orca": patch
---

**The worker client settles every call, and a bundle can be handed over without a copy.** A reply from the worker that said a call failed but carried no readable error left that call waiting forever (a page showed "Converting..." for good); such a reply now rejects the call with `invalid_file`. `unwrapBundle` takes the same `transfer` option as `open`, so a caller can move a large bundle into the worker instead of copying it, and the worker no longer copies each entry a second time before handing it back.
