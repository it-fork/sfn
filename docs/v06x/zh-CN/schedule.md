<!-- title: 定时任务; order: 17 -->
## 基本概念

自 0.5.x 版本起，SFN 引入了分布式的任务系统，并以微服务方式运行。要使用这个任务
系统，你需要创建一个或者多个 schedule 服务器程序，但无需担心，这依旧非常简单。

v0.6 版本修改了三处 `app.schedule` 接口的细节：

1. 使用 MD5 字符串来作为任务 ID
2. 时间单位修改为秒
3. `data` 属性修改为一个数组以便能够传输多个参数到处理器函数中。

## 创建服务器

### 配置

首先需要在配置文件中添加一项新的 RPC 服务器配置：

```typescript
// src/config.ts
export default <app.Config> {
    server: {
        rpc: {
            "schedule-server": {
                host: "localhost",
                port: 8001,
                services: [app.services.schedule]
            }
        }
    }
}
```

（注：`app.services.schedule` 是一个框架内部集成的服务，你不需要编写这个服务的代码。）

### 启动服务器

```sh
node dist schedule-server
```

## 创建定时任务

你可以在任何地方，使用 `app.schedule.create()` 方法来创建定时任务。

```typescript
var taskId = app.schedule.create({
    salt: "my-schedule-1",
    start: moment().unix() + 5,
}, async () => {
    // do every thing in here after 5 seconds.
});

var taskId2 = app.schedule.create({
    salt: "my-schedule-2",
    start: moment().add(5, "minutes").unix() // using moment library
    repeat: 5, // running repeatedly every 5 seconds
    end: momen().add(1, "hour").unix() // stops after 1 hour
}, async () => {
    // ...
});

var taskId3 = app.schedule.create({
    salt: "my-schedule-3",
    timetable: ["18:00", "19:00", "20:00"], // using timetable
    repeat: 24 * 60 * 60 // runs every day
}, async () => {
    // ...
});
```

如果你想要取消一个定时任务，只需要调用 `app.schedule.cancel()` 方法即可。

```typescript
app.schedule.cancel(taskId);
```

### 关于 salt

`app.schedule.create()` 会根据传入的参数自动计算出一个唯一的任务 ID，但是多个任务可能会
因为用来计算的属性相同而得到相同的 ID，并导致后面的任务取代先前的任务，因此推荐为每一个定时任务
设置一个独特的 `salt`。注意 `salt` 必须要唯一，并且不会因为系统重启或重载而改变。

## 将模块绑定到定时任务

除了在创建任务时提供一个可执行的回调函数，你还可以将一个模块和方法绑定为定时任务
的处理器函数，这样做可以享受额外的好处，例如，即使服务器重启了，定时任务依旧可以
恢复运行。

```typescript
// services/someService.ts
declare global {
    namespace app {
        namespace services {
            const myService: ModuleProxy<MyService>;
        }
    }
}

export default class MyService {
    async syncDataEveryDay() {
        // ...
    }
}

var taskId = app.schedule.create({
    start: moment().unix(),
    repeat: 3600 * 24,
    module: app.services.myService,
    handler: "syncDataEveryDay"
});
```

## 传递数据到定时任务的处理器函数中

在创建定时任务的时候，你可以提供 `data` 选项，所设数据将会在处理器函数被调用时被作为参数传递到
函数中。注意：数据将会被序列化以便于传输，任何不支持序列化的数据都将会丢失，并且数据已经设置将
不可改变。

```typescript
export default class MyService {
    async syncDataEveryDay(data: { foo: any }) {
        // ...
    }
}

var taskId = app.schedule.create({
    start: moment().unix(),
    repeat: 3600 * 24,
    module: app.services.myService,
    handler: "syncDataEveryDay",
    data: [{ foo: "Hello, World!" }]
});
```