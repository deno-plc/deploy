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

import { assert } from "@std/assert/assert";
import { decodeBase64Url, encodeBase64Url } from "@std/encoding/base64url";

export function assert_sha256_hash(h: string) {
    const blob_hash = decodeBase64Url(h);
    assert(blob_hash.length === 32);
    const hash = encodeBase64Url(blob_hash);
    assert(hash.length === 43);
    assert(hash === h);
}
