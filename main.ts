import { Hono } from "hono";
import { HTTPException } from 'hono/http-exception';
import { assert } from "@std/assert/assert";
import { join } from "@std/path";
import { Service } from "./src/services.ts";
import z from "zod";
import { getLogger } from "@logtape/logtape";

const kv = await Deno.openKv();

const app = new Hono();

const cli = new Hono();

const log = getLogger(["deploy", "main"]);

cli.get("/start", async c => {
    const cwd = c.req.query("cwd");

    assert(cwd, "cwd is required");

    const service = Service.by_path(join(cwd, "deploy.json"));

    await service.start();

    return c.text(`Successfully started ${service.name}`);
});

cli.get("/start/:id", async c => {
    const name = c.req.param("id");

    assert(name, "id is required");

    const service = Service.by_name(name);

    assert(service, `Service ${name} not found`);

    await service.start();

    return c.text(`Successfully started ${service.name}`);
});

cli.get("/stop", async c => {
    const cwd = c.req.query("cwd");

    assert(cwd, "cwd is required");

    const service = Service.by_path(join(cwd, "deploy.json"));

    await service.stop();

    return c.text(`Successfully stopped ${service.name}`);
});

cli.get("/stop/:id", async c => {
    const name = c.req.param("id");

    assert(name, "id is required");

    const service = Service.by_name(name);

    assert(service, `Service ${name} not found`);

    await service.stop();

    return c.text(`Successfully stopped ${service.name}`);
});

cli.get("/restart", async c => {
    const cwd = c.req.query("cwd");

    assert(cwd, "cwd is required");

    const service = Service.by_path(join(cwd, "deploy.json"));

    await service.restart();

    return c.text(`Successfully restarted ${service.name}`);
});

cli.get("/restart/:id", async c => {
    const name = c.req.param("id");

    assert(name, "id is required");

    const service = Service.by_name(name);

    assert(service, `Service ${name} not found`);

    await service.restart();

    return c.text(`Successfully restarted ${service.name}`);
});


cli.get("/install", async c => {
    const cwd = c.req.query("cwd");

    assert(cwd, "cwd is required");

    const service = Service.by_path(join(cwd, "deploy.json"));

    // force reload of manifest
    const manifest = await service.loadManifest();

    await kv.set(["known_services", service.manifest_path], {
        autostart: false,
    });

    return c.text(`Successfully installed ${manifest.name} v${manifest.version} from ${service.manifest_path}`);
});

cli.get("/delete", async c => {
    const cwd = c.req.query("cwd");

    assert(cwd, "cwd is required");

    const service = Service.by_path(join(cwd, "deploy.json"));

    await kv.delete(["known_services", service.manifest_path]);

    await service.delete();

    return c.text(`Successfully deleted ${service.name}`);
});

cli.get("/delete/:id", async c => {
    const name = c.req.param("id");

    assert(name, "id is required");

    const service = Service.by_name(name);

    assert(service, `Service ${name} not found`);

    await kv.delete(["known_services", service.manifest_path]);

    await service.delete();

    return c.text(`Successfully deleted ${service.name}`);
});

cli.get("/autostart/:enabled", async c => {
    const enable_param = c.req.param("enabled");

    const enabled = enable_param === "enable";

    if (!enabled) {
        assert(enable_param === "disable", "Invalid value for enabled");
    }

    const cwd = c.req.query("cwd");

    assert(cwd, "cwd is required");

    const service = Service.by_path(join(cwd, "deploy.json"));

    await kv.set(["known_services", service.manifest_path], {
        autostart: enabled,
    });

    return c.text(`Successfully set autostart for ${service.name} to ${enabled}`);

});

cli.get("/autostart/:enabled/:id", async c => {
    const enable_param = c.req.param("enabled");

    const enabled = enable_param === "enable";

    if (!enabled) {
        assert(enable_param === "disable", "Invalid value for enabled");
    }

    const name = c.req.param("id");

    assert(name, "id is required");

    const service = Service.by_name(name);

    assert(service, `Service ${name} not found`);

    await kv.set(["known_services", service.manifest_path], {
        autostart: enabled,
    });

    return c.text(`Successfully set autostart for ${service.name} to ${enabled}`);
});

cli.get("/list", async c => {
    return c.text(Service.list().map(s => `${s.name} (${s.status},${s.manifest_path})`).join("\n"));
});

cli.get("/help", c => {
    return c.text(`Available commands:
    start [id]
    stop [id]
    restart [id]

    install
    delete [id]

    autostart <enable|disable> [id]

    list
    
    help
    `);
});

cli.use(async (c) => {
    return await c.text(`Command not found (${c.req.url})`, 404);
});

app.route("/cli-proxy", cli);

app.onError((err, c) => {
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

Deno.serve({
    hostname: "127.0.0.1",
    port: 8888,
    onListen: (local) => {
        log.info`Listening on ${local.hostname}:${local.port}`;
    },
}, app.fetch);

for await (const { key, value } of kv.list({ prefix: ["known_services"] })) {
    try {

        const path = key[1] as string;

        const service = Service.by_path(path);

        // wait until manifest is loaded and name is known
        await service.last_manifest;

        log.info`Restored service ${service.name} from ${path}`;

        if (z.object({
            autostart: z.boolean().default(false),
        }).parse(value).autostart) {
            await service.start();
            log.info`Successfully auto-started ${service.name}`;
        }

    } catch (e) {
        console.error(e);
    }
}
