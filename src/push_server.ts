/**
 * @license GPL-3.0-or-later
 * Deno-PLC Deploy
 *
 * Copyright (C) 2025 Hans Schallmoser
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

import { Hono } from "hono";
import { encodeBase64Url } from "@std/encoding/base64url";
import { Manifest } from "./manifest.ts";
import { ensureDir } from "@std/fs/ensure-dir";
import { join } from "@std/path/join";
import { assert_sha256_hash } from "./utils.ts";
import { assert } from "@std/assert/assert";
import { exec_cli } from "./cli.ts";

await ensureDir(join(Deno.cwd(), "services/blob"));

export const authorized_hashes = new Set<string>();
export const authorized_data_hashes = new Set<string>();

export const push_server = new Hono();

class ManifestExecutor {
    constructor(readonly manifest: Manifest) {
        for (const hash of manifest.attachments) {
            authorized_data_hashes.add(hash);
        }
        for (const step of manifest.steps) {
            if (step.kind === "unpack") {
                assert(authorized_data_hashes.has(step.hash));
            }
        }
    }
    #next_step = 0;
    async execute_step(n_step: number) {
        assert(n_step === this.#next_step);
        this.#next_step++;

        const step = this.manifest.steps[n_step];
        assert(step);

        if (step.kind === "exec") {
            return await exec_cli(step.cmd, join(Deno.cwd(), "/services"));
        } else if (step.kind === "unpack") {
            await Deno.copyFile(
                join(Deno.cwd(), "services/blob", `${step.hash}.bin`),
                join(Deno.cwd(), "services/data", step.path),
            );
            return `OK`;
        } else {
            throw new Error(`unknown step type`);
        }
    }
}

const executors = new Map<string, ManifestExecutor>();

push_server.post("/manifest", async (c) => {
    const body = await c.req.parseBody();
    const f = body["file"];
    console.log(f);

    if (f instanceof File) {
        const content = await f.arrayBuffer();
        const hash = await crypto.subtle.digest("SHA-256", content);
        const hash_string = encodeBase64Url(hash);
        if (authorized_hashes.has(hash_string)) {
            const manifest = Manifest.parse(
                JSON.parse(new TextDecoder().decode(content)),
            );
            const executor = new ManifestExecutor(manifest);
            executors.set(hash_string, executor);
            authorized_hashes.delete(hash_string);
            return c.text("OK");
        } else {
            return c.text("Unauthorized", 401);
        }
    }

    return c.text("Not a file", 400);
});

push_server.get("/attachment/:hash", async (c) => {
    const hash = c.req.param("hash");
    assert_sha256_hash(hash);

    if (authorized_data_hashes.has(hash)) {
        try {
            await Deno.stat(join(Deno.cwd(), "services/blob", `${hash}.bin`));
            return c.text("OK", 200);
        } catch (_e) {
            return c.text("Not found", 404);
        }
    } else {
        return c.text("Forbidden", 403);
    }
});

push_server.post("/attachment/:hash", async (c) => {
    const hash = c.req.param("hash");
    assert_sha256_hash(hash);

    if (authorized_data_hashes.has(hash)) {
        const body = await c.req.parseBody();
        const f = body["file"];
        if (f instanceof File) {
            const content = await f.arrayBuffer();
            const real_hash = encodeBase64Url(
                await crypto.subtle.digest("SHA-256", content),
            );
            assert(real_hash === hash);
            await Deno.writeFile(
                join(Deno.cwd(), "services/blob", `${hash}.bin`),
                new Uint8Array(content),
            );
            return c.text("OK");
        }
    }

    return c.text("Not found", 404);
});

push_server.post("/step/execute", async (c) => {
    const n = Number(c.req.query("n"));
    const hash = c.req.query("manifest") ?? "";
    assert_sha256_hash(hash);

    const executor = executors.get(hash);
    assert(executor, "No such executor");

    const res = await executor.execute_step(n);

    return c.text(res);
});

push_server.get("/info/target", (c) => {
    return c.text(Deno.build.target);
});
