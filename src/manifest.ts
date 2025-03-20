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

import z from "zod";
import { assert_sha256_hash } from "./utils.ts";

export const ZodHash = z.string().refine((v) => {
    try {
        assert_sha256_hash(v);
        return true;
    } catch (_e) {
        return false;
    }
});

export const ManifestStep = z.union([
    z.object({
        kind: z.literal("exec"),
        cmd: z.string().array(),
    }),
    z.object({
        kind: z.literal("unpack"),
        path: z.string(),
        hash: ZodHash,
    }),
]);
export type ManifestStep = z.infer<typeof ManifestStep>;

export const Manifest = z.object({
    version: z.literal("1.1"),
    attachments: ZodHash.array(),
    steps: z.array(ManifestStep),
});
export type Manifest = z.infer<typeof Manifest>;
