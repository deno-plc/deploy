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

import { type Args, parseArgs } from "@std/cli/parse-args";
import { getLogger } from "@logtape/logtape";
import { loadServices, Service } from "./services.ts";

const logger = getLogger(["deploy", "cli"]);

export async function exec_cli(str_args: string[], cwd: string): Promise<string> {
    logger.info`Execute CLI: ${str_args} in ${cwd}`;

    const verb = str_args.shift();

    const args = parseArgs(str_args);

    const output = [];
    for await (const chunk of exec_core(verb ?? "", args, cwd)) {
        output.push(chunk);
    }
    return output.join("\n");
}

async function* exec_core(verb: string, args: Args, _cwd: string) {
    yield `Deno-PLC Deploy Copyright (C) 2024 - 2025 Hans Schallmoser
This program comes with ABSOLUTELY NO WARRANTY; for details type 'about'.`;
    switch (verb) {
        case "reload":
            await loadServices();
            yield `Service configurations reloaded`;
            break;
        case "start": {
            const name = String(args._[0]);
            const service = Service.by_name(name);

            if (service) {
                await service.start();
                yield `Service ${name} started`;
            } else {
                yield `Service ${name} not found`;
            }

            break;
        }
        case "stop": {
            const name = String(args._[0]);
            if (name === ".") {
                for (const service of Service.list()) {
                    if (service.status === "running") {
                        await service.stop();
                    }
                    yield `All services stopped`;
                }
            } else {
                const service = Service.by_name(name);
                if (service) {
                    await service.stop();
                    yield `Service ${name} stopped`;
                } else {
                    yield `Service ${name} not found`;
                }
            }
            break;
        }
        case "restart": {
            const name = String(args._[0]);
            const service = Service.by_name(name);

            if (service) {
                await service.restart();
                yield `Service ${name} restarted`;
            } else {
                yield `Service ${name} not found`;
            }
            break;
        }
        case "list": {
            const services = Service.list();
            if (services.length === 0) {
                yield `No services`;
            } else {
                yield `Services:`;
                for (const service of services) {
                    yield `  ${service.name} (${service.status})`;
                }
            }
            break;
        }

        case "about":
            yield `This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.`;
            break;
        default:
            yield `Unknown command '${verb}'`;
        /* falls through */
        case "help":
            yield `Usage: <command> [--option value]

Available commands:
    reload           Reload all service configurations
    start <name>     Start a service
    stop <name>      Stop a service
    restart <name>   Restart a service
    list             List all services
    about            Display information about the program
    help             Display this help message`;
            break;
    }
}
