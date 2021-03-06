<!-- title: Getting Start; order: 1 -->

>This documentation is for SFN 0.5.x, for old version SFN documentation, please 
> [click here](/docs/v0.4.x/getting-started).

### Initiate Your Project

Create a directory to store files of your project, then use the command

```sh
npm init
```

to initiate your project, assume you have some knowledge of 
[NPM](https://www.npmjs.com/) and have [NodeJS](https://nodejs.org) installed.

### Prepare TypeScript Environment

**SFN** is written in [TypeScript](https://www.typescriptlang.org), which your
own code should be as well.

```sh
npm i -D typescript
npm i -D @types/node
```

Optionally, you can install [ts-node](https://github.com/TypeStrong/ts-node) to
run the program without compiling source code.

```sh
npm i -D ts-node
```

### Install PM2 (Optional)

Since version 0.3.x, SFN uses [PM2](https://pm2.io) as its application manager 
and load-balancer, so to better deploy your application, you'd also install PM2
and use it to start you application (however it is production environment 
requirement, not necessary during development).

```sh
npm i -g pm2
```

### Install Framework

After you have initiated your project, you can now install **SFN** by using 
this command:

```sh
npm i sfn
```

After all files downloaded, type the following command to initiate your project,
it will create needed files and directories for you automatically.

But before running this procedure, you have to setup the environment for NodeJS 
to run user-defined commands. See [Command Line](./command-line).

```sh
sfn init
```

### Start Demo Server

**SFN** provides a demo, so you can now start server and see what will happen.

```sh
tsc
node dist
```

If you wish to run the project via ts-node, use the following command instead:

```sh
ts-node --files src # --files flag must be provided
```

And the server should be started in few seconds.

If you have PM2 installed, you can use the following command to start the 
application, and auto-scale according to the CPU numbers.

```sh
pm2 start dist/index.js -i max -n my-app
```