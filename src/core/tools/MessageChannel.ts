import values = require("lodash/values")

export class MessageChannel {
    private topics: { [name: string]: ((data: any) => void)[] } = {};

    constructor(readonly name: string) { }

    /**
     * Publishes `data` to the given `topic` in the channel, if `servers` are
     * provided, the topic will only be emitted to them.
     */
    publish(topic: string, data?: any, servers?: string[]): boolean {
        topic = this.name + "#" + topic;

        if (app.rpc.server) {
            // If the current server is an RPC server, publish the topic via the
            // RPC channel.
            return app.rpc.server.publish(topic, data, servers);
        } else if (this.topics[topic] && this.topics[topic].length > 0) {
            // Invoke the listeners asynchronously.
            (async () => {
                for (let listener of this.topics[topic]) {
                    listener.call(void 0, data);
                }
            })().catch(() => null);

            return true;
        } else {
            return false;
        }
    }

    /** Subscribes a `listener` to the given `topic` of the channel. */
    subscribe(topic: string, listener: (data: any) => void) {
        topic = this.name + "#" + topic;

        if (!this.topics[topic]) {
            this.topics[topic] = [];
        }

        this.topics[topic].push(listener);

        // If there are active RPC connections, subscribe the topic to the RPC
        // channel as well.
        for (let connection of values(app.rpc.connections)) {
            connection.subscribe(topic, <any>listener);
        }

        return this;
    }

    /** Unsubscribes a `listener` or all listeners of the `topic`. */
    unsubscribe(topic: string, listener?: (data: any) => void) {
        topic = this.name + "#" + topic;

        let listeners = this.topics[topic] || [];

        // Unsubscribe topic listeners in the RPC channel.
        for (let connection of values(app.rpc.connections)) {
            connection.unsubscribe(topic, <any>listener);
        }

        // Remove topic listeners in the message channel.
        if (!listeners.length) {
            return false;
        } else if (listener) {
            let i = listeners.indexOf(listener);
            return i === -1 ? false : listeners.splice(i, 1).length > 0;
        } else {
            return delete this.topics[topic];
        }
    }
}

export abstract class Message {
    readonly abstract name: string;

    constructor(protected data: any = {}) { }

    /** Sends the message via a front end server. */
    via(appId: string): InstanceType<new (...args: any[]) => this> {
        return new (<any>this.constructor)({ ...this.data, appId });
    }

    /** Sends the message to a specified target. */
    to(target: string): InstanceType<new (...args: any[]) => this> {
        return new (<any>this.constructor)({ ...this.data, target });
    }

    protected getAppId() {
        let appId: string;

        if (this.data.appId) {
            appId = this.data.appId;
            delete this.data.appId;
        } else if (app.rpc.server) {
            // If appId isn't provided, use the default web server.
            appId = "web-server-1";
        } else {
            appId = app.id;
        }

        return appId;
    }
}

export class WebSocketMessage extends Message {
    readonly name = "app.message.ws";

    get volatile() {
        return new WebSocketMessage({ ...this.data, volatile: true });
    }

    get local() {
        return new WebSocketMessage({ ...this.data, local: true });
    }

    of(nsp: string) {
        return new WebSocketMessage({ ... this.data, nsp });
    }

    binary(hasBinary?: boolean) {
        return new WebSocketMessage({ ... this.data, binary: hasBinary });
    }

    emit(event: string, ...data: any[]) {
        return app.message.publish(this.name, {
            ...this.data,
            event,
            data
        }, [this.getAppId()]);
    }
}

export class SSEMessage extends Message {
    readonly name = "app.message.sse";

    close() {
        return app.message.publish(this.name, {
            ...this.data,
            close: true
        }, [this.getAppId()]);
    }

    send(data: any) {
        return app.message.publish(this.name, {
            ...this.data,
            data,
        }, [this.getAppId()]);
    }

    emit(event: string, data?: any) {
        return app.message.publish(this.name, {
            ...this.data,
            event,
            data,
        }, [this.getAppId()]);
    }
}