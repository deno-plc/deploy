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

import { z } from "zod";
import { dirname, join } from "@std/path";
import { generate_run_id } from "./logs.ts";
import { getLogger } from "@logtape/logtape";
import { ensureDir } from "@std/fs/ensure-dir";

const log = getLogger(["deploy", "services"]);

const services_by_path = new Map<string, Service>();
const services_by_name = new Map<string, Service>();

const Manifest = z.object({
    name: z.string(),
    executable: z.string(),
    args: z.array(z.string()).default([]),
    cwd: z.string().optional(),
    log_dir: z.string().optional(),
});
type Manifest = z.infer<typeof Manifest>;

export class Service {
    private constructor(readonly manifest_path: string) {
        services_by_path.set(manifest_path, this);
        this.name = manifest_path;
        log.info`Service ${this.name} created`;
    }

    static by_path(manifest_path: string) {
        return services_by_path.get(manifest_path) ??
            new Service(manifest_path);
    }

    static by_name(name: string) {
        return services_by_name.get(name);
    }

    static list() {
        return Array.from(services_by_path.values());
    }

    async delete() {
        services_by_path.delete(this.manifest_path);
        services_by_name.delete(this.name);
        if (this.current) {
            await this.stop();
        }
    }

    current: ServiceRun | null = null;
    name: string;
    status: "running" | "stopped" = "stopped";

    last_manifest: Manifest | Promise<Manifest> = this.loadManifest();

    last_manifest_content =
        `manifest has not loaded yet ${crypto.randomUUID()}`;

    async loadManifest(): Promise<Manifest> {
        const content = await Deno.readTextFile(this.manifest_path);
        if (content === this.last_manifest_content) {
            log.debug`Unchanged manifest ${this.manifest_path} for ${this.name}, skipping reload`;
            return this.last_manifest;
        }

        log.info`Loading manifest for ${this.name}`;

        const manifest = Manifest.parse(JSON.parse(content));

        this.name = manifest.name;
        services_by_name.set(manifest.name, this);

        this.last_manifest_content = content;
        this.last_manifest = manifest;

        return manifest;
    }

    async start() {
        const manifest = await this.loadManifest();
        log.info`Attempting to start service ${this.name}`;
        if (this.current) {
            log.error`Failed to start service: Service ${this.name} is already running`;
            throw new Error("Service is already running");
        }
        this.current = new ServiceRun(this, manifest);
        this.current.run();
        this.status = "running";
        log.info`Service ${this.name} started`;
    }

    async stop() {
        log.info`Attempting to stop service ${this.name}`;
        if (!this.current) {
            log.error`Failed to stop service: Service ${this.name} is not running`;
            throw new Error("Service is not running");
        }
        await this.current.stop();
        this.status = "stopped";
        log.info`Service ${this.name} stopped`;
    }

    async restart() {
        log.info`Attempting to restart service ${this.name}`;
        if (this.current) {
            await this.stop();
        }
        await this.start();
        log.info`Service ${this.name} restarted`;
    }
}

export class ServiceRun {
    readonly run_id = generate_run_id();
    command: Deno.ChildProcess | null = null;
    log_file: Deno.FsFile | null = null;
    constructor(readonly service: Service, readonly manifest: Manifest) {
    }

    async run() {
        const { manifest, service } = this;
        const { manifest_path } = service;

        const log_dir = manifest.log_dir
            ? join(dirname(manifest_path), manifest.log_dir)
            : join(Deno.cwd(), "services/logs");
        await Deno.mkdir(log_dir).catch(() => {});
        this.log_file = await Deno.open(
            join(log_dir, `${this.service.name}-${this.run_id}.log`),
            { write: true, create: true, append: true },
        );

        const local_exec = join(dirname(manifest_path), manifest.executable);
        const executable = await Deno.stat(local_exec).then(() => local_exec)
            .catch(() => manifest.executable);

        await this.log_file.write(new TextEncoder().encode(`
    run ID: ${this.run_id}
    start time: ${new Date().toISOString()}
    executable: ${executable}
    args: ${manifest.args.join(" ")}
    cwd: ${manifest.cwd ?? dirname(manifest_path)}

`));

        const cmd = new Deno.Command(executable, {
            stdout: "piped",
            stderr: "piped",
            args: manifest.args,
            cwd: manifest.cwd ?? dirname(manifest_path),
        });
        this.command = cmd.spawn();

        this.finished = this.run_long().catch((e) => {
            log.error`Error running service ${service.name}: ${e}`;
        });
    }

    async run_long() {
        await Promise.all(
            [this.command!.stdout, this.command!.stderr].map(async (stream) => {
                const reader = stream.getReader();
                let done = false;
                while (!done) {
                    const { value, done: streamDone } = await reader.read();
                    if (streamDone) {
                        done = true;
                    } else {
                        await this.log_file!.write(value);
                    }
                }
            }),
        );

        if (!this.requested_exit) {
            log.error`Service ${this.service.name} exited unexpectedly`;
        }

        const status = await this.command?.status;

        await this.log_file!.write(new TextEncoder().encode(`
    exit code: ${status?.code}
    end time: ${new Date().toISOString()}
    graceful exit: ${this.requested_exit ? "yes" : "no"}
    `));

        this.log_file?.close();

        this.service.current = null;
    }

    finished: Promise<void> | null = null;

    requested_exit = false;

    public async stop() {
        this.requested_exit = true;
        this.command?.kill();
        await this.finished;
    }
}

export async function loadServices() {
    let count = 0;
    for await (const entry of Deno.readDir(join(Deno.cwd(), "services/data"))) {
        if (entry.isFile && entry.name.endsWith(".service.json")) {
            await Service.by_path(join(Deno.cwd(), "services/data", entry.name))
                .loadManifest();
            count++;
        }
    }
    log.info`Loaded/updated ${count} service configurations`;
}
await ensureDir(join(Deno.cwd(), "services/data"));
await loadServices();
