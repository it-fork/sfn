import * as Session from "express-session";
import * as sessionFileStore from "session-file-store";
import { ServerResponse } from "http";
import { Stats } from "fs";
import serveStatic = require("serve-static");
import * as Mail from "sfn-mail";
import { DBConfig } from "modelar";
import { ClientOpts } from "redis";
import { ServerOptions } from "socket.io";
import * as https from "https";
import * as http2 from "http2";
import { SRC_PATH, ROOT_PATH } from "./init";

/**
 * @see https://www.npmjs.com/package/serve-static
 */
export interface StaticOptions extends serveStatic.ServeStaticOptions {
    setHeaders?: (res: ServerResponse, path: string, stat: Stats) => void;
};

export interface SFNConfig {
    /** `dev` | `development`, `pro` | `production`. */
    env?: string;
    /** Default language of the application. */
    lang?: string;
    /**
	 * If `true`, when a method's jsdoc contains tag `@route` (for 
	 * `HttpController`s) or `@event` (for `SocektController`s), the value 
	 * after them will be used as a HTTP route or socket event.
	 * @example
	 * @route GET /user/:id
	 * @event show-user-info
	 */
    enableDocRoute?: boolean;
    /**
     * If `true`, when a method is a generator function, it will be treated as
     * a coroutine function and await its result.
     */
    awaitGenerator?: boolean;
    /** Worker names, must not more than CPU numbers. */
    workers?: string[];
    /**
     * The directories that serve static resources.
     * @see https://www.npmjs.com/package/serve-static
     */
    statics?: string[] | { [path: string]: StaticOptions },
    /** 
     * Watch file changes of the given file/folder names in `APP_PATH` in 
     * development, when watching a folder, watching `.js/.ts` and `.json` files
     * in it.
     */
    watches?: string[],
    server: {
        /** Host name(s), used for calculating the subdomain. */
        hostname?: string | string[];
        /** HTTP request timeout, default value is `120000`. */
        timeout?: number;
        /**
         * Auto-start server when worker is online, if `false`, you must call 
         * `startServer()` manually.
         */
        autoStart?: boolean;
        /**
         * Since SFN 0.2.0, when HTTPS or HTTP2 is enabled, will always force 
         * HTTP request to redirect to the new protocol, and setting port for 
         * HTTP server is no longer allowed, the framework will automatically 
         * start a server that listens port `80` to accept HTTP request and 
         * redirect them to HTTPS.
         */
        http?: {
            /** Server type, AKA protocol type, default value is `http`. */
            type?: "http" | "https" | "http2";
            /** Default value is `80`. */
            port?: number;
            /**
             * These options are mainly for type `http` and type `http2`.
             * @see https://nodejs.org/dist/latest-v10.x/docs/api/https.html#https_https_createserver_options_requestlistener
             * @see https://nodejs.org/dist/latest-v10.x/docs/api/http2.html#http2_http2_createserver_options_onrequesthandler
             * @see https://nodejs.org/dist/latest-v10.x/docs/api/tls.html#tls_tls_createsecurecontext_options
             */
            options?: https.ServerOptions & http2.ServerOptions;
        };
        /** (deprecated) use `http` instead. */
        https?: SFNConfig["server"]["http"];
        /** Configurations of WebSocket server. */
        websocket?: {
            enabled?: boolean;
            /**
             * By default, this `port` is `0` or `undefined`, that means it will
             * attach to the HTTP server instead. If you change it, it will 
             * listen to that port instead.
             */
            port?: number;
            /**
             * Options for SocketIO.
             * @see https://socket.io
             */
            options?: ServerOptions;
        };
        /**
         * Datagram server is different from other servers, it runs in the 
         * master process, internally it is used for receiving commands from 
         * outside the program.
         */
        dgram?: {
            enabled: boolean;
            port?: number;
        };
        /** Configurations when HTTP requests or socket events throw errors. */
        error?: {
            /** If `true`, display full error information to the client. */
            show?: boolean;
            /** If `true` errors will be logged to disk files. */
            log?: boolean;
        };
    };
    /**
     * Configurations for Modelar ORM.
     * @see https://github.com/hyurl/modelar
     */
    database?: DBConfig;
    /**
     * Configurations for Express-Session.
     * @see https://www.npmjs.com/package/express-session
     */
    session?: Session.SessionOptions;
    /**
     * Configurations for sfn-mail.
     * @see https://github.com/Hyurl/sfn-mail
     */
    mail?: Mail.Options & Mail.Message;
    /**
     * Configurations for Redis.
     * @see https://www.npmjs.com/package/redis
     */
    redis?: ClientOpts;
}

const FileStore = sessionFileStore(Session);

/**
 * The configuration of the program.
 * Some of these settings are for their dependencies, you may check out all 
 * supported options on their official websites.
 */
export const config: SFNConfig = {
    env: process.env.NODE_ENV || "pro",
    lang: "en-US",
    enableDocRoute: false,
    awaitGenerator: false,
    workers: ["A"],
    statics: [SRC_PATH + "/assets"],
    watches: ["index.ts", "config.ts", "bootstrap", "controllers", "locales", "models"],
    server: {
        hostname: "localhost",
        timeout: 120000, // 2 min.
        autoStart: true,
        http: {
            type: "http",
            port: 80,
            options: null,
        },
        websocket: {
            enabled: true,
            port: undefined,
            options: {
                pingTimeout: 5000,
                pingInterval: 5000
            },
        },
        dgram: {
            enabled: true,
            port: 666
        },
        error: {
            show: true,
            log: true,
        }
    },
    database: {
        type: "mysql",
        host: "localhost",
        port: 3306,
        database: "modelar",
        user: "root",
        password: "161301"
    },
    session: {
        secret: "sfn",
        name: "sfn-sid",
        resave: true,
        saveUninitialized: true,
        unset: "destroy",
        store: new FileStore({
            path: ROOT_PATH + "/sessions",
            ttl: 3600 * 24 // 24 hours (in seconds)
        }),
        cookie: {
            maxAge: 3600 * 24 * 1000 // 24 hours (in milliseconds)
        }
    },
    mail: {
        pool: false,
        host: "",
        port: 25,
        secure: false,
        from: "",
        auth: {
            username: "",
            password: ""
        }
    },
    redis: {
        host: null,
        port: null
    }
};