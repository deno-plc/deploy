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

import { ensureDir } from "@std/fs/ensure-dir";
import { emptyDir } from "@std/fs/empty-dir";
import { join } from "@std/path/join";

await ensureDir(join(Deno.cwd(), "services/auth"));
await emptyDir(join(Deno.cwd(), "services/auth"));

const auths = new Map<string, InteractiveAuth>();

export class InteractiveAuth {
    status: "pending" | "accepted" | "expired" = "pending";

    constructor(readonly id: string, readonly execute: () => void) {
        this.#start();

        setTimeout(() => {
            this.status = "expired";
            this.#stop();
        }, 60 * 1000);
    }

    async #start() {
        auths.set(this.id, this);
        await Deno.writeTextFile(
            join(Deno.cwd(), "services/auth", `${this.id}.bat`),
            `powershell.exe -Command "Invoke-WebRequest -URI http://localhost:8888/auth/interactive/accept?token=${this.id}"`,
        );
    }

    async #stop() {
        if (auths.get(this.id) === this) {
            auths.delete(this.id);
            await Deno.remove(
                join(Deno.cwd(), "services/auth", `${this.id}.bat`),
            ).catch(() => {});
        }
    }

    static async handle(token: string) {
        const self = auths.get(token);
        if (self) {
            switch (self.status) {
                case "accepted":
                case "expired":
                    break;
                case "pending":
                    self.status = "accepted";
                    await self.#stop();
                    self.execute();
                    break;
            }
        }
    }
}
