import * as CallSiteRecord from "callsite-record";
import * as moment from "moment";
import * as fs from "fs-extra";
import * as path from "path";
import chalk from "chalk";
import { isTsNode, isDevMode, SRC_PATH, APP_PATH } from "../../init";
import service from './Service';
import startsWith = require('lodash/startsWith');

const tryImport = createImport(require);

export function isOwnMethod(obj: any, method: string): boolean {
    return typeof obj[method] === "function" &&
        (<Object>obj.constructor.prototype).hasOwnProperty(method);
}

export function moduleExists(name: string): boolean {
    return fs.existsSync(name + (isTsNode ? ".ts" : ".js"));
}

export async function callsiteLog(err: Error) {
    var csr = CallSiteRecord({
        forError: err,
    });

    if (csr) {
        let str = await csr.render({});
        str = str.replace(/default_\d\./g, "default.");

        console.log();
        console.log(err.toString());
        console.log();
        console.log(str);
        console.log();
    }
}

export function createImport(require: Function): (id: string) => {
    [x: string]: any;
    default?: any
} {
    return (id: string) => {
        try {
            return require(id);
        } catch (err) {
            if (isDevMode) {
                callsiteLog(err);
            } else {
                let msg = err.toString(),
                    i = err.stack.indexOf("\n") + 1,
                    stack: string;

                stack = (err.stack.slice(i, err.stack.indexOf("\n", i))).trim();
                stack = stack.replace("_1", "").slice(3);

                process.nextTick(() => {
                    // Delay importing the Server module, allow configurations
                    // finish import before using them in service.
                    service.logger.hackTrace(stack);
                    service.logger.error(msg);
                });
            }

            return {};
        }
    };
}

function color(color: string, callSite: TemplateStringsArray, bindings: any[]): string {
    let msg = callSite.map((str, i) => {
        return i > 0 ? bindings[i - 1] + str : str;
    }).join("");
    return chalk[color](`[${moment().format("YYYY-MM-DDTHH:mm:ss")}]`) + " " + msg;
}

export function grey(callSite: TemplateStringsArray, ...bindings: any[]) {
    return color("grey", callSite, bindings);
}

export function green(callSite: TemplateStringsArray, ...bindings: any[]) {
    return color("green", callSite, bindings);
}

export function yellow(callSite: TemplateStringsArray, ...bindings: any[]) {
    return color("yellow", callSite, bindings);
}

export function red(callSite: TemplateStringsArray, ...bindings: any[]) {
    return color("red", callSite, bindings);
}

export function resolveModulePath(baseDir: string) {
    let target = { stack: "" };

    Error.captureStackTrace(target);

    let lines = target.stack.split("\n").slice(1);
    let re = /[\(\s](\S+):\d+:\d+?/;
    let filename: string;
    let ext: string;

    for (let line of lines) {
        let matches = re.exec(line);

        if (matches) {
            filename = matches[1][0] === "(" ? matches[1].slice(1) : matches[1];
            filename = filename.replace(SRC_PATH, APP_PATH);

            if (startsWith(filename, baseDir))
                break;
        }
    }

    if (!filename)
        return;

    if (ext = path.extname(filename)) {
        filename = filename.slice(0, -ext.length);
    }

    return filename;
}

export async function importDirectory(dir: string) {
    var ext = isTsNode ? ".ts" : ".js";
    var files: string[]

    try { files = await fs.readdir(dir); } catch (e) { }

    if (!files) return;

    for (let file of files) {
        let filename = path.resolve(dir, file);
        let stat = await fs.stat(filename);

        if (stat.isFile() && path.extname(file) == ext) {
            tryImport(filename);
        } else if (stat.isDirectory()) {
            // load files recursively.
            importDirectory(filename);
        }
    }
}