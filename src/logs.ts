/**
 * @license GPL-3.0-or-later
 * Deno-PLC Deploy
 *
 * Copyright (C) 2024 - 2025 Hans Schallmoser
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {
    configure,
    getConsoleSink,
    getFileSink,
    getLogger,
    type Sink,
} from "@logtape/logtape";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { NO_LOGFILE } from "./self-config.ts";

export function generate_run_id() {
    const now = new Date();

    let id = "";

    id += now.getFullYear().toString().padStart(4, "0");
    id += (now.getMonth() + 1).toString().padStart(2, "0");
    id += now.getDate().toString().padStart(2, "0");
    id += "-";
    id += now.getHours().toString().padStart(2, "0");
    id += now.getMinutes().toString().padStart(2, "0");
    id += "-";
    id += crypto.randomUUID();

    return id;
}

export const run_id = generate_run_id();

async function file_sink() {
    const log_dir = join(Deno.cwd(), "services/logs");

    await ensureDir(log_dir);

    const log_file = join(log_dir, `deploy-${run_id}.log`);

    console.log(`logs will be written to ${log_file}`);

    return getFileSink(log_file);
}

const all_sinks = NO_LOGFILE ? ["console"] : ["console", "file"];

await configure({
    sinks: NO_LOGFILE
        ? {
            console: getConsoleSink(),
        }
        : {
            console: getConsoleSink(),
            file: await file_sink(),
        } as Record<string, Sink>,
    loggers: [
        {
            category: ["deploy"],
            lowestLevel: "debug",
            sinks: all_sinks,
        },
        {
            category: ["logtape", "meta"],
            lowestLevel: "warning",
            sinks: all_sinks,
        },
    ],
});

const log = getLogger(["deploy", "self"]);

log.info(`Deploy-Host run ID: ${run_id}`);

addEventListener("unhandledrejection", (e) => {
    log.fatal`Unhandled rejection: ${e}`;
    throw e;
});
