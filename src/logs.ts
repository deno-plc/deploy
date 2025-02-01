import { configure, getConsoleSink, getFileSink, getLogger, getStreamSink } from "@logtape/logtape";
import { join } from "@std/path";

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

const log_dir = join(Deno.cwd(), "logs");

await Deno.mkdir(log_dir).catch(() => { });

const log_file = join(log_dir, `run-${run_id}.host.log`);

console.log(`logs will be written to ${log_file}`);

await configure({
    sinks: {
        console: getConsoleSink(),
        file: getFileSink(log_file),
    },
    loggers: [
        {
            category: ["deploy"],
            lowestLevel: "info",
            sinks: ["console", "file"],
        }
    ]
});

const log = getLogger(["deploy", "self"]);

log.info(`Deploy-Host run ID: ${run_id}`);

