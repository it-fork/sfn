import { MessageChannel, WebSocketMessage, SSEMessage } from "../tools/MessageChannel";

declare global {
    namespace app {
        const message: MessageChannel & {
            ws: WebSocketMessage,
            sse: SSEMessage
        };
    }
}

global["app"].message = new MessageChannel("app.message");
global["app"].message.ws = new WebSocketMessage;
global["app"].message.sse = new SSEMessage;