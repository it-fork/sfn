import * as fs from "fs";
import * as path from "path";
import Worker = require("sfn-worker");
import { notifyReload } from './functions';

var timer: NodeJS.Timer = null;

function timerCallback(event, filename, extnames) {
    let ext = path.extname(filename);

    if (event === "change" && extnames.includes(ext)) {
        notifyReload();
    }
}

/**
 * Development mode file watcher, if a directory is watched, when the files in
 * it is modified, the workers will be restarted.
 */
export class DevWatcher {
    readonly watcher: fs.FSWatcher;

    constructor(dirname: string, extnames = [".js", ".json"]) {
        if (Worker.isWorker) {
            throw new Error(`${this.constructor.name} can only be used in the master process.`);
        }

        this.watcher = fs.watch(dirname, {
            recursive: true,
        }, (event, filename) => {
            clearTimeout(timer);
            timer = setTimeout(timerCallback, 300, event, filename, extnames);
        });
    }

    close(): void {
        this.watcher.close();
    }
}