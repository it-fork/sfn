import cookieParser = require("cookie-parser");
import { config } from "../bootstrap/load-config";
import { WebSocket } from "../tools/interfaces";

const parse = cookieParser(config.session.secret);

export default async function (socket: WebSocket, next: (err?: Error) => void) {
    parse(<any>socket.handshake, <any>{}, next);
}

export async function handler2(socket: WebSocket, next: (err?: Error) => void) {
    socket.cookies = socket.handshake["cookies"];
    await next();
}