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

import { encodeBase64Url } from "@std/encoding/base64url";
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { Manifest } from "../src/manifest.ts";
import { assert } from "@std/assert/assert";

await configure({
    sinks: {
        console: getConsoleSink(),
    },
    loggers: [
        {
            category: "deploy",
            sinks: ["console"],
        },
        {
            category: ["logtape", "meta"],
            lowestLevel: "warning",
            sinks: ["console"],
        },
    ],
});

const logger = getLogger(["deploy", "push"]);

// const body = new FormData();

// body.append("manifest", new Blob([JSON.stringify({
//     version: "1.0",
//     steps: [],
// })], { type: "application/json" }));

// const res = await fetch("http://localhost:8888/push/manifest", {
//     method: "POST",
//     body,
// });
// console.log(res);

async function push_file(url: URL, file: File) {
    logger.info`Pushing file ${file.name}`;
    const body = new FormData();

    body.append("file", file);

    const res = await fetch(url, {
        method: "POST",
        body,
    });

    if (!res.ok) {
        logger.error`Failed to push file: ${res.status} ${await res.text()}`;
    }
}

async function push_manifest(
    server: URL,
    manifest: Manifest,
    get_attachment: (hash: string) => Promise<ArrayBuffer>,
) {
    const serialized_manifest = new TextEncoder().encode(
        JSON.stringify(manifest),
    );
    const hash = await crypto.subtle.digest("SHA-256", serialized_manifest);
    const hash_str = await authenticate(server, hash);
    assert(hash_str);
    await push_file(
        new URL("./push/manifest", server),
        new File([serialized_manifest], "manifest.json"),
    );

    for (const attachment of manifest.attachments) {
        const check_request = await fetch(
            new URL(`./push/attachment/${attachment}`, server),
        );

        if (check_request.status === 404) {
            logger.info`Pushing attachment ${attachment}`;
            await push_file(
                new URL(`./push/attachment/${attachment}`, server),
                new File(
                    [await get_attachment(attachment)],
                    `${attachment}.bin`,
                ),
            );
        } else if (check_request.status === 200) {
            logger.debug`reusing attachment ${attachment}`;
        } else {
            logger
                .error`Failed to push attachment: ${check_request.status} ${await check_request
                .text()}`;
        }
    }

    let n_step = 0;
    for (const step of manifest.steps) {
        logger.info`Executing step ${n_step}`;

        const step_request = await fetch(
            new URL(
                `./push/step/execute?n=${n_step}&manifest=${hash_str}`,
                server,
            ),
            {
                method: "POST",
            },
        );

        if (!step_request.ok) {
            logger
                .error`Failed execute step: ${step_request.status} ${await step_request
                .text()}`;

            break;
        } else {
            logger.info`Step executed successfully ${await step_request
                .text()}`;
        }

        n_step++;
    }
}

async function authenticate(server: URL, hash: ArrayBuffer) {
    const hash_string = encodeBase64Url(hash);
    const base_url = new URL(`./auth/interactive/`, server);

    logger.debug`Requesting interactive auth for ${hash_string}`;
    const auth_request = await fetch(
        new URL(`./request?hash=${hash_string}`, base_url),
    );

    if (!auth_request.ok) {
        logger
            .error`Failed to request interactive auth: ${auth_request.status} ${await auth_request
            .text()}`;
        return;
    }

    if (base_url.hostname === "localhost") {
        logger.debug`Trying to self-accept the interactive auth (localhost)`;
        await fetch(new URL(`./accept?token=${hash_string}`, base_url));
    }

    let status = "pending";
    const start = performance.now();
    let printed_instructions = false;

    while (status === "pending" && performance.now() - start < 60_000) {
        logger.debug`polling interactive auth status`;
        const status_request = await fetch(
            new URL(`./status?hash=${hash_string}`, base_url),
        );

        if (status_request.ok) {
            const res = await status_request.json();
            if (res.status === "accepted") {
                status = "accepted";
                break;
            } else if (!printed_instructions) {
                // prevent string injection
                const ext = String(res.file_extension).substring(0, 4) ||
                    ".bat";
                logger
                    .info`Please accept the interactive auth by executing ${`services/auth/${hash_string}${ext}`} on the target device`;
                printed_instructions = true;
            }
        } else {
            logger
                .error`Failed to poll interactive auth status: ${status_request.status} ${await status_request
                .text()}`;
        }

        await new Promise((r) => setTimeout(r, 1000));
    }

    if (status === "accepted") {
        logger.info`Interactive auth succeeded`;
        return hash_string;
    } else {
        logger.error`Interactive auth failed`;
        return null;
    }
}

// await authenticate(new URL("http://localhost:8888"), await crypto.subtle.digest("SHA-256", new TextEncoder().encode("test")));
await push_manifest(new URL("http://localhost:8888"), {
    version: "1.1",
    attachments: [],
    steps: [
        {
            kind: "exec",
            cmd: ["stop", "."],
        },
    ],
}, async () => new Uint8Array([1, 2, 3, 4]).buffer);
