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
import { HTTPException } from "hono/http-exception";
import { assert } from "@std/assert/assert";
import z from "zod";
import { getLogger } from "@logtape/logtape";
import {
    ALLOW_INTERACTIVE_AUTH,
    ALLOW_LOCALHOST_AUTH,
    ALLOW_PUSH,
    STARTUP_EVAL,
} from "./src/self-config.ts";
import { exec_cli } from "./src/cli.ts";
import { InteractiveAuth } from "./src/interactive_auth.ts";
import { decodeBase64Url, encodeBase64Url } from "@std/encoding/base64url";
import { authorized_hashes, push_server } from "./src/push_server.ts";
import { join } from "@std/path";

const log = getLogger(["deploy", "main"]);

const local_server = new Hono();

const public_server = new Hono();

if (ALLOW_LOCALHOST_AUTH) {
    const cli_proxy_server = new Hono();

    cli_proxy_server.get("/exec", async (c) => {
        const res = await exec_cli(
            z.string().array().parse(
                JSON.parse(decodeURIComponent(c.req.query("cmd") ?? "")),
            ),
            c.req.query("cwd") ?? ".",
        );
        return c.text(res);
    });

    local_server.route("/cli-proxy", cli_proxy_server);
}

if (ALLOW_INTERACTIVE_AUTH) {
    local_server.get("/auth/interactive/accept", async (c) => {
        const token = c.req.query("token");
        assert(token);

        await InteractiveAuth.handle(token);

        return c.text("OK");
    });

    public_server.get("/auth/interactive/request", (c) => {
        const raw_hash = c.req.query("hash");
        const blob_hash = decodeBase64Url(raw_hash ?? "");
        if (blob_hash.length !== 32) {
            throw new HTTPException(400);
        } else {
            const hash = encodeBase64Url(blob_hash);
            assert(hash.length === 43);
            assert(hash === raw_hash);
            new InteractiveAuth(hash, () => {
                authorized_hashes.add(hash);
            });
            return c.json({
                status: "pending",
            });
        }
    });

    public_server.get("/auth/interactive/status", (c) => {
        const hash = c.req.query("hash");
        if (authorized_hashes.has(hash ?? "")) {
            return c.json({
                status: "accepted",
            });
        } else {
            return c.json({
                status: "pending",
                file_extension: Deno.build.os === "windows" ? ".bat" : ".sh",
            });
        }
    });
}

if (ALLOW_PUSH) {
    public_server.route("/push", push_server);
}

local_server.route("/", public_server);

Deno.serve({
    hostname: "127.0.0.1",
    port: 8888,
    onListen: (local) => {
        log.info`localhost server listening on 127.0.0.1:${local.port}`;
    },
}, local_server.fetch);

Deno.serve({
    hostname: "0.0.0.0",
    port: 8888,
    onListen: (p) => {
        log.info`Public serve listening on ${p.hostname}:${p.port}`;
    },
}, public_server.fetch);

if (STARTUP_EVAL) {
    console.log(await exec_cli(STARTUP_EVAL.split(" "), Deno.cwd()));
}

try {
    const startup_json = JSON.parse(
        await Deno.readTextFile(join(Deno.cwd(), "services/startup.json")),
    );
    for (const { cmd } of startup_json.startup) {
        await exec_cli(cmd, join(Deno.cwd(), "services"));
    }
} catch (e) {
    log.error`Failed to execute startup.json: ${e}`;
}
