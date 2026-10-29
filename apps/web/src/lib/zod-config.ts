// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";

// Silence zod's eval probe under Content-Security-Policy without 'unsafe-eval'
z.config({ jitless: true });
