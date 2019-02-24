import { Server as HttpServer } from "http";
import { Server as HttpsServer, createServer } from "https";
import { Http2SecureServer } from "http2";
import { App } from "webium";
import * as SocketIO from "socket.io";
import chalk from "chalk";
import { APP_PATH, isCli } from "../../init";
import { config, baseUrl } from "./load-config";
import service, { Service } from '../tools/Service';
import {
    red,
    green,
    moduleExists,
    createImport,
    importDirectory
} from "../tools/functions-inner";
import "./load-controller";
import "./load-locale";
import "./load-model";
import "./load-service";
import "./load-view";
import "./load-plugin";
import "./rpc-support";
import { watchWebModules } from "./hot-reload";

declare global {
    namespace app {
        var router: App;
        var http: HttpServer | HttpsServer | Http2SecureServer;
        var ws: SocketIO.Server;
        var service: Service;
        function serve(port?: number): void;
    }
}

/** The basic HTTP router created by **webium** framework. */
export var router: App = null;
/** The HTTP server. */
export var http: HttpServer | HttpsServer | Http2SecureServer = null;
/** The WebSocket server created by **SocketIO** framework. */
export var ws: SocketIO.Server = null;

const tryImport = createImport(require);
let hostnames = config.server.hostname,
    httpServer = config.server.http,
    httpPort = httpServer.port,
    WS = config.server.websocket;

/**
 * Starts HTTP server and socket server (if enabled).
 */
app.serve = function serve(port?: number) {
    // load HTTP middleware
    require("../handlers/https-redirector");
    require("../handlers/http-init");
    require("../handlers/http-static");
    require("../handlers/http-xml");
    require("../handlers/http-session");
    require("../handlers/http-db");
    require("../handlers/http-auth");

    // Load user-defined bootstrap procedures.
    let httpBootstrap = APP_PATH + "/bootstrap/http";
    moduleExists(httpBootstrap) && tryImport(httpBootstrap);

    if (WS.enabled) {
        // Load user-defined bootstrap procedures.
        let wsBootstrap = APP_PATH + "/bootstrap/websocket";
        moduleExists(wsBootstrap) && tryImport(wsBootstrap);
    }

    // Start HTTP server.
    if (typeof http["setTimeout"] == "function") {
        http["setTimeout"](config.server.http.timeout);
    }

    http.on("error", (err: Error) => {
        console.log(red`${err.toString()}`);
        if (err.message.includes("listen")) {
            process.exit(1);
        }
    }).listen(port || httpPort, () => {
        // load controllers
        importDirectory(app.controllers.path);
        watchWebModules();

        if (typeof process.send == "function") {
            // notify PM2 that the service is available.
            process.send("ready");
        } else {
            console.log(green`HTTP server running at ${chalk.yellow(baseUrl)}.`);
        }
    });
}

if (!isCli) {
    router = new App({
        cookieSecret: <string>config.session.secret,
        domain: hostnames
    });

    switch (httpServer.type) {
        case "http":
            http = new HttpServer(router.listener);
            break;
        case "https":
            http = createServer(httpServer.options, router.listener);
            break;
        case "http2":
            http = require("http2").createSecureServer(
                httpServer.options,
                router.listener
            );
            break;
    }

    if (WS.enabled) {
        if (!WS.port)
            ws = SocketIO(http, WS.options);
        else
            ws = SocketIO(WS.port, WS.options);
    }

    // Load user-defined bootstrap procedures.
    let bootstrap = APP_PATH + "/bootstrap/index";
    moduleExists(bootstrap) && tryImport(bootstrap);

    // load worker message handlers
    require("../handlers/worker-shutdown");

    // load plugins
    importDirectory(app.plugins.path);

    // try to sync any cached data hosted by the default cache service.
    service.cache.sync().catch((err: Error) => service.logger.error(err.message));
}

app.router = router;
app.http = http;
app.ws = ws;
app.service = service;