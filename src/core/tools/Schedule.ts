import * as path from "path";
import * as fs from "fs-extra";
import md5 = require("md5");
import moment = require('moment');
import { ROOT_PATH } from '../../init';
import { traceModulePath } from './internal/module';
import { timestamp } from "./functions";
import sift from "sift";

export interface TaskOptions<T = any, D extends any[] = any[]> {
    /**
     * A UNIX timestamp, date-time string or Date instance of when should the
     * task starts running.
     */
    start?: number | string | Date;
    /** If set, add the current UNIX timestamp and used as the start time. */
    startIn?: number;
    /**
     * A UNIX timestamp, date-time string or Date instance of when should the
     * task stops running.
     */
    end?: number | string | Date;
    /** If set, add the current UNIX timestamp and used as the end time. */
    endIn?: number;
    /**
     * A list of certain times of when should the task be running.
     * 
     * This property conflicts with `start` and `startIn` properties, and is of
     * the most priority.
     */
    timetable?: (number | string | Date)[];
    /**
     * A number of seconds of how often should the task be running repeatedly.
     */
    repeat?: number;
    /** 
     * The salt must be unique and predictable for each task, so that when the
     * module is reloaded, the new task can override the ole one, to keep there 
     * being only one task alive doing the same job.
     */
    salt?: string;
    /**
     * If provided, the schedule will be bound to a specified `module` and must
     * provide the `handler` a method of the module instance.
     */
    module?: ModuleProxy<T>;
    /**
     * A callback function or a method name of the `module` instance (if 
     * provided). 
     */
    handler?: ((...data: D) => void) | keyof FunctionProperties<T>;
    onEnd?: ((...data: D) => void) | keyof FunctionProperties<T>
    /**
     * The data passed to the handler as arguments, note that the data will be
     * jsonified for transmission, anything that cannot be jsonified will be
     * lost during transmission.
     */
    data?: D
}

export interface ScheduleTask {
    appId: string;
    taskId: string;
    start: number;
    end?: number;
    repeat?: number;
    timetable?: number[];
    module?: string;
    handler?: string;
    onEnd?: string;
    data?: any[]
}

export class Schedule {
    constructor(readonly name: string) { }

    /**
     * Creates a new schedule task according to the options and returns the task
     * ID. NOTE: the minimum tick interval of the schedule service is `1000`ms. 
     */
    create<D extends any[]>(
        options: TaskOptions, handler: (...data: D) => void): string;
    create<T, D extends any[]>(options: TaskOptions<T, D>): string;
    create(options: TaskOptions, handler: Function | string = null): string {
        let {
            salt,
            start,
            startIn,
            end,
            endIn,
            repeat,
            timetable,
            module,
            data,
            onEnd
        } = options;
        let params: string[] = [app.id, traceModulePath(ROOT_PATH)];

        salt && params.push(salt);
        module && params.push(module.name);
        handler = handler || options.handler;

        if (handler) {
            if (typeof handler === "string") {
                if (module) {
                    params.push(handler);
                } else {
                    throw new TypeError(
                        "'module' option must be provided " +
                        "when 'handler' is provided a string"
                    );
                }
            } else if (handler.name) {
                params.push(handler.name);
            } else {
                let hash = md5(String(handler));

                if (!salt) {
                    salt = hash;
                    params.unshift(salt);
                }

                params.push(hash);
            }
        } else {
            throw new TypeError("'handler' must be provided for scheduling");
        }

        if (params.length < 3) {
            throw new TypeError(
                "not enough options for scheduling, try providing a 'salt'"
            );
        }

        // Compatible fix with milliseconds
        if (typeof start === "number" && String(start).length === 13 && repeat) {
            repeat = Math.ceil(repeat / 1000);
        }

        if (!timetable) {
            if (!start) {
                if (startIn) {
                    start = moment().unix() + startIn;
                } else {
                    start = moment().unix();
                }
            } else {
                start = timestamp(start);
            }
        } else {
            let now = moment().unix();

            timetable = timetable
                .map(timestamp)
                .sort()
                .filter((time, i, table) => {
                    if (time < now) {
                        if (repeat) {
                            table[i] += repeat;
                            return true;
                        } else {
                            return false;
                        }
                    } else {
                        return true;
                    }
                });
        }

        if (!end) {
            if (endIn) {
                end = moment().unix() + endIn;
            }
        } else {
            end = timestamp(end);
        }

        let taskId = md5(params.join("#"));

        // If the handler is provided a callable function, directly subscribe 
        // the event using the handler.
        // Otherwise, the schedule will be delivered to an internal subscriber
        // which listens all potential schedule task published.
        if (typeof handler === "function") {
            app.message.unsubscribe(taskId);
            app.message.subscribe(taskId, (data: any[]) => {
                (<Function>handler).apply(void 0, data);
            });
        }

        if (typeof onEnd === "function") {
            app.message.unsubscribe(taskId + ".onEnd");
            app.message.subscribe(taskId + ".onEnd", (data: any[]) => {
                (<Function>onEnd).apply(void 0, data);
            });
        }

        // Redirect the task to one of the schedule server.
        app.services.schedule(taskId).add({
            taskId,
            appId: app.id,
            start: <number>start,
            end: <number>end,
            timetable: <number[]>timetable,
            repeat,
            module: module && module.name,
            handler: typeof handler === "string" ? handler : void 0,
            onEnd: typeof onEnd === "string" ? onEnd : void 0,
            data
        });

        return taskId;
    }

    /** Cancels a task according to the given task ID. */
    cancel(taskId: string) {
        app.message.unsubscribe(taskId);
        app.services.schedule(taskId).delete(taskId);
    }
}

export class ScheduleService {
    private timer: NodeJS.Timer = null;
    private state: "uninitiated" | "running" | "stopped" = "uninitiated";
    private tasks = new Map<string, ScheduleTask>();
    private filename = app.ROOT_PATH + `/cache/schedules-${app.id}.json`;

    /** @inner Use `app.schedule.create()` instead. */
    async add(task: ScheduleTask) {
        this.state === "uninitiated" && await this.init();
        this.tasks.set(task.taskId, task);
        return true;
    }

    /** @inner Use `app.schedule.cancel()` instead. */
    async delete(taskId: string) {
        let task = this.tasks.get(taskId);

        if (task) {
            this.dispatch(task, "onEnd");
            return true;
        } else {
            return false;
        }
    }

    /** Retrieves a specific task according to the taskId. */
    async query(taskId: string): Promise<ScheduleTask>;
    /** Retrieves a list of tasks matched the queries (using mongodb syntax). */
    async query(condition?: object): Promise<ScheduleTask[]>;
    async query(condition: string | object = {}) {
        if (typeof condition === "string") {
            return this.tasks.get(condition);
        } else {
            return ([...this.tasks])
                .map(([, task]) => task)
                .filter(sift(condition));
        }
    }

    /**
     * Counts the size of the task queue, or specific tasks matched the queries
     * (using mongodb syntax).
     */
    async count(condition: object = null) {
        if (!condition) {
            return this.tasks.size;
        } else {
            return this.query(condition).then(tasks => tasks.length);
        }
    }

    private isScheduleServer() {
        let servers = app.config.server.rpc || {};

        for (let id in servers) {
            let services = servers[id].services || [];
            if (id === app.id && services.includes(app.services.schedule)) {
                return true;
            }
        }

        return false;
    }

    async init() {
        this.state = "running";
        this.timer = setInterval(() => {
            let now = timestamp();

            for (let [, task] of this.tasks) {
                let { start, end, repeat, timetable } = task;
                let expired = !(!end || now < end);

                if (!expired) {
                    if (timetable) {
                        if (timetable.length === 0) {
                            expired = true;
                        } else {
                            for (let i = timetable.length; --i;) {
                                if (now >= timetable[i]) {
                                    this.dispatch(task);

                                    if (repeat) {
                                        timetable[i] += repeat;
                                    } else {
                                        timetable.splice(i, 1);

                                        if (timetable.length === 0) {
                                            expired = true;
                                        }
                                    }

                                    break;
                                }
                            }
                        }
                    } else if (now >= start) {
                        this.dispatch(task);

                        if (repeat) {
                            task.start = now + repeat;
                        } else {
                            expired = true;
                        }
                    }
                }

                if (expired) {
                    this.dispatch(task, "onEnd");
                }
            }
        }, 1000);

        if (app.config.saveSchedules) {
            try {
                let tasks: ScheduleTask[] = await fs.readJSON(this.filename);

                for (let task of tasks) {
                    // compatible with old version
                    Array.isArray(task) && (task = task[1]);

                    this.tasks.set(task.taskId, task);
                }
            } catch (e) { }

            if (this.isScheduleServer()) {
                // Continuously flush tasks to disk file for backup.
                this.add({
                    taskId: "d41d8cd98f00b204e9800998ecf8427e", // empty string
                    appId: app.id,
                    start: moment().unix() + 900, // in 15 minutes
                    repeat: 900, // every 15 minutes
                    module: app.services.schedule.name,
                    handler: "flush"
                });
            }
        }
    }

    async destroy(transferTasks = false) {
        if (this.state !== "running") {
            return;
        } else {
            this.state = "stopped";
        }

        clearInterval(this.timer);

        let isScheduleServer = this.isScheduleServer();
        let jobs: Promise<any>[] = [];

        for (let [taskId, task] of this.tasks) {
            if (transferTasks && !isScheduleServer) {
                this.tasks.delete(taskId);
                jobs.push(app.services.schedule(taskId).add(task));
            }
        }

        await Promise.all(jobs);

        if (app.config.saveSchedules && isScheduleServer) {
            await this.flush();
        }
    }

    async flush() {
        let tasks = [...this.tasks.values()].filter(task => {
            return task.taskId !== "d41d8cd98f00b204e9800998ecf8427e";
        });
        await fs.emptyDir(path.dirname(this.filename));
        await fs.writeJSON(this.filename, tasks);
    }

    private dispatch(task: ScheduleTask, fn: "handler" | "onEnd" = "handler") {
        let { taskId, appId, module, data } = task;
        let handler = task[fn];

        if (!handler) {
            if (fn === "onEnd") {
                app.message.publish(taskId + ".onEnd", data, [appId]);
            } else {
                app.message.publish(taskId, data, [appId]);
            }
        } else {
            app.message.publish(app.schedule.name, [
                module,
                handler,
                data
            ], [appId]);
        }

        // If an task is expired or canceled, remove it from the queue.
        if (fn === "onEnd") {
            this.tasks.delete(taskId);
        }
    }
}

export default ScheduleService;