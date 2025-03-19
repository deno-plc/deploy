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

import "./src/logs.ts";

import { Hono } from "hono";
import { HTTPException } from 'hono/http-exception';
import { assert } from "@std/assert/assert";
import { join } from "@std/path";
import { Service } from "./src/services.ts";
import z from "zod";
import { getLogger } from "@logtape/logtape";
import { ALLOW_LOCALHOST_AUTH, STARTUP_EVAL } from "./src/self-config.ts";
import { exec_cli } from "./src/cli.ts";
import { ensureDir } from "@std/fs/ensure-dir";

const log = getLogger(["deploy", "main"]);

const cli_proxy_server = new Hono();

cli_proxy_server.get("/exec", async c => {
    const res = await exec_cli(z.string().array().parse(JSON.parse(decodeURIComponent(c.req.query("cmd") ?? ""))), c.req.query("cwd") ?? ".");
    return c.text(res);
});

cli_proxy_server.onError((err, c) => {
    if (err
        instanceof HTTPException
    ) {
        // Get the custom response
        return err
            .getResponse
            ();
    } else {
        return c.text(`Error: ${String(err)}`, 500);
    }
});

if (ALLOW_LOCALHOST_AUTH) {
    const local_server = new Hono();

    local_server.route("/cli-proxy", cli_proxy_server);


    Deno.serve({
        hostname: "127.0.0.1",
        port: 8888,
        onListen: (local) => {
            log.info`Listening on ${local.hostname}:${local.port}`;
        },
    }, local_server.fetch);
}

if (STARTUP_EVAL) {
    console.log(await exec_cli(STARTUP_EVAL.split(" "), Deno.cwd()));
}

// for await (const { key, value } of kv.list({ prefix: ["known_services"] })) {
//     try {

//         const path = key[1] as string;

//         const service = Service.by_path(path);

//         // wait until manifest is loaded and name is known
//         await service.last_manifest;

//         log.info`Restored service ${service.name} from ${path}`;

//         if (z.object({
//             autostart: z.boolean().default(false),
//         }).parse(value).autostart) {
//             await service.start();
//             log.info`Successfully auto-started ${service.name}`;
//         }

//     } catch (e) {
//         console.error(e);
//     }
// }
