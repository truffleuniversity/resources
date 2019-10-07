---
name: 'Truffle Internals: Deep Dive'
date: '2019-07-02'
description: 'Deep dive into the guts of the Truffle Suite.'
author: 'Dan Dokic'
menu: Articles
---

By: [Dan Dokic](https://medium.com/@djokicx)

> Based on a Medium [post](https://medium.com/@djokicx/truffle-internals-deep-dive-43adb7c3e6cf).

# Truffle Internals: Deep Dive
*This post is mainly based on the transcription of a talk given by G. Nicholas D’Andrea [@gnidan](https://github.com/gnidan) over at [Truffle University](https://www.trufflesuite.com/university). Nicholas is a developer at Truffle Suite who primarily works on truffle’s core product.* 

When it comes to developing decentralized applications, Truffle Suite is the standard of choice. Truffle development framework provides you with:
 
* Truffle: development environment
* Ganache: a personal, configurable development blockchain that you can run locally; also provided with its own GUI
* Drizzle: set of front-end libraries to help synchronize your contract data, layered on top of a Redux store

In this post, I attempt to dive into the internals of the development environment, so some previous experience with truffle technology or smart contract development is desirable. Like many other projects in the blockchain space, Truffle is **open-source**. Therefore, I reference [Truffle git repository](https://github.com/trufflesuite/truffle) frequently, so I suggest you follow along.

If you are not familiar with the Truffle Suite, I recommend starting [here](http://www.dappuniversity.com/articles/the-ultimate-ethereum-dapp-tutorial).

With that out of the way, let’s jump right into it.

# Truffle Design
Truffle was built with the command/workflow-first approach in mind. Truffle is command-oriented: `truffle init`, `truffle compile`, etc. <!--revise--> Project's code is structured in a way where everything fits into a command with commonalities across them.

Another commonality is in contract abstractions, which is handled by the ***truffle-contract*** package. These abstractions help facilitate contract interaction. One frequently used function that’s provided by contract abstraction is `ContractName.deployed()`. 

The abstractions are fueled by ***artifacts*** which are persistent JSON files that get stored in the */build* directory of your project when you run `truffle compile`. The abstractions use these files to give you the helper function for contract interaction.

Let’s take a look at the different packages.

## truffle
The truffle package brings everything together. It contains a [*webpack*](https://webpack.js.org/concepts/) config - a module bundler for Javascript files. This package also includes some integration test.

## truffle-core
This package is the main entry point for Truffle. It all starts with *cli.js*. This file sets up the ‘command’ infrastructure, processes the user arguments, and then subsequently runs the command you specified. It also handles error handling and makes sure that the program exits gracefully.

The command argument fetches the proper command from *./lib/commands* directory. This directory is where all the commands are defined. So for example, if you run `truffle compile`, it runs *compile.js* located in this directory. Each command defines its own options/flags that you can specify when you run the command (e.g. `truffle compile --all`). Also, each command defines its `run(options, done)` method which gets invoked in the previously mentioned *cli.js*. The `options` argument includes the options you defined in *truffle.config* (e.g., if you specified Solidity compiler in the config file, it  makes its way to this options object). If you have an empty configuration file, Truffle falls back to the default configuration values. It also takes a callback function `done` which gets invoked when we are done processing this `run` function. All of the commands use this mechanism and expect a callback.


## truffle-config
In *index.js* of this package, we can see the default values defined for configuration. It also defines a `detect` method where it tries to load the user-specified configuration file. It merges it with default configuration values in such a way that user-specified values take precedence and overwrite the default values.

## truffle-contract
Truffle-contract is a smart contract abstraction that allows you to interact with your contract. Essentially, it is a wrapper around web3js. It’s initialized with helper functions, e.q. you can call `myContract.deployed()` to get the deployed instance of the contract or `myContract.someFunc()` to call a specific contract method. These translate to JSON RPC requests. Based on the ABI passed to it, it differentiates between a read and a write on the blockchain, i.e., between a transaction and a call.

If you send a transaction to the blockchain, the abstraction also waits for this transaction to get mined and keeps waiting for a number of blocks defined by `timeoutBlocks`. Few other parameters are also available to specify how you want the Truffle process to listen for results of transactions you posted. Truffle-contract also provides revert reason string in case of a reverted transaction. Under the hood, it has to resend the same transaction as a call (a read). Transactions modify the blockchain but do not provide any return values. A call on the same function simulates what would happen in a transaction but discard the state changes when done. They are a local invocation on the node you are connected to and don’t get broadcasted. They also do not consume any Ether.

The helper functions use promises and therefore can be used with Javascript’s async/await syntax.

*Note: `myContract.deployed()` only works if you are using Truffle’s migration system to deploy your contracts.*


## truffle-contract-schema

This package defines the underlining format of the artifacts. The formal spec can is located in the */spec* folder. This schema underpins JSON files that get generated in */build* folder when `truffle compile` command is executed. Currently, there is no simple way to get artifacts for external contracts into your Truffle project unless you take the external smart contract source code and compile it yourself to get an artifact. The only required property for an artifact is the ABI, and you are able to interact with the contract. However, you also need to specify the `network` and `address` property of the artifact to interact with the intended instance of the contract. Simply building the artifact from the source code doesn’t give you that. Either way - it’s a clunky process at the moment. The upcoming tool from the Truffle Suite titled Truffle DB is intended to be a replacement/enhancement for the artifacts.



## truffle-workflow-compile

This package handles the compilation. It gets invoked when you run the `truffle compile` command, but compilation is also performed as part of `truffle migrate` and `truffle test `commands. Inside the *index.js* we can see that it does two things. First, it grabs all the smart contract source files and compiles them — Truffle supports different compilers which you can specify: Solidity, Vyper, or run arbitrary external commands. 

Second, it collects the compiled results and passes them to the Artifactor. When it comes to artifacts, there are two sides to it, the **Resolver** and the **Artifactor**. 


## truffle-artifactor

The Artifactor takes these abstractions, converts them into artifacts and writes it onto the disk (abstraction and artifact have the same format, except that abstraction has helper functions). Before saving it, the Artifactor examines the already existing artifacts for the same contract on your disk that you might have previously created. If it finds any, it merges them with the new ones, so that the new build does not unexpectedly break something. E.g., the newly created artifact and the already existing one might have different networks defined. Fields like **abi** and whatever changed in your smart contract source get overwritten.

## truffle-resolver

We can see the Resolver in the following example: 

```
const contractName = artifact.require(“ContractName”);
```

Every time you use this syntax (e.g., during testing or deployment), `artifact` is an instance of Resolver. The Resolver can pull from npm, epm or disk. Inside of the package, we can see different Javascript files that handle these different sources. They all get plugged-in together in *index.js* where the `require()` function looks for the import path of the artifact in these various sources. This artifact is then used to make a contract abstraction. The Resolver also attaches a web3 provider & network to the generated contract abstraction.

## truffle-compile

This package specifies the source of your compiler in */compilerSupplier* and is directed at Solidity compilers exclusively. Truffle uses solc.js by default rather than native binaries for the compilation. Solc.js offers greater portability, but it’s slower when it comes to compilation. Also, managing native binaries for different Solidity versions can become cumbersome, so using docker images comes as a great alternate option.

## truffle-migrate

When you run `truffle-init` two files are created, the *Migrations.sol* smart contract, and the initial migration file *1\_initial\_migration.js*. The initial migration deploys the Migration contract to the specified network. The subsequent migrations deal with the details of the deployment of the smart contracts you create. After each migration, it records it to on-chain by sending a transaction to the Migrations contract that you initially deployed and updates the `last_completed_migration`. This is evident in *migration.js* where `migrations.setCompleted()` function is called right after the migration. 

Migrations help automate and manage the deployment of new software versions and aren’t exclusive to Truffle.

## truffle-deployer

We can see the syntax **deployer** uses in migration files:

```
deployer.deploy(ContractName);
```

The deployer uses promises, and it chains actions together. It queues up the deployment and keeps track of every operation, effectively making a recipe for Truffle migrate to follow. The deployer indicates all the operations in the migration scripts, e.g. `deployer.deploy()` or `deployer.link()`. Truffle migrate takes these instructions from the deployer and executes them in the order provided.

## truffle-test

Truffle test does not have its package. It is located under *truffle-core* package under */lib/test.js*. The tests hook up everything to Mocha, both for Solidity tests as well as Javascript tests. The testing environment compiles and deploys your contracts to a test network (for Solidity tests, it also deploys test contracts you created), sets up testing wallet accounts and provides other setup needed for the testing environment such as extending test timeouts. It also defines the `contract()` function that you have certainly seen if you wrote Javascript tests in your Truffle projects: 

```
contract("MyContract", () => {
    it("asserts some ", async() => {
    ...
    }
}
```

The `contract()` function is the biggest differentiatior from Mocha.

Truffle test also runs Ganache in the background for you as a testing network (if no testing network is specified). Another thing that the testing framework provides is the ability to roll back the state after running each test file - Ganache itself provides this feature as it’s able to take a snapshot of its state, and then revert to it after the test. This allows for a “clean-room environment” and ensures that your test files do not share state.
 
# Summary

The Truffle team is massively enabling growth and adoption of Dapp development by making it easier for developers to jump into the ecosystem. With new features coming out such as Truffle DB and Truffle Team, the project is continuously reshaping its processes and adding new functionalities.

If you are interested in decentralization and utilizing technology for building applications of transparency and trust, make sure you check out the [Truffle University](https://www.trufflesuite.com/university).