# Cast a vote on ballot.sol via any.sender 

We have put together an example of how to use the any.sender service. Of course, we'll use everyone's first and favourite smart contract Ballot.sol. 

## High-level overview

The user wants to cast a vote in Ballot.sol using the any.sender service. We'll cover the contracts involved, how to register for the any.sender service, how to check your balance, how to prepare the relay transaction and how it is processed. By the end of it, you'll have a good understanding of how everything works. 

### Contracts

We have two contracts:
- *Ballot.sol:* Our voting smart contract (with built-in meta-transaction support)
- *Relay.sol:* All any.sender relay jobs are sent via a central contract. 

We have an additional smart contract, RefundAdjudicator.sol, that will force an any.sender operator to refund the customer if it fails to satisify a promised quality of service. We will talk about that later :)

### Registrating for any.sender

Registering for the any.sender service is straight-forward. 

All the customer needs to do is deposit ether in Relay.sol. 

We provide a simple [deposit utility](https://github.com/stonecoldpat/anysender-voting/blob/master/src/ts/anysender-utils.ts#L23) function to handle sending the required ether to the relay.sol contract:

```
onchainDeposit(toDeposit: BigNumber, wallet: Wallet)
````

By depositing in the Relay.sol contract, the any.sender service will acknowledge the deposit and associate it with the sending key. *Coming soon: A DepositFor() function, to let users deposit on behalf of others.*

(In the future; we might support deposits in ERC20 that are auto-swapped to ETH via uniswap/kyberswap.)

### Checking balance in any.sender

But how do I know if any.sender has recognised a deposit? Easy. 

We provide a simple [check balance ultility](https://github.com/stonecoldpat/anysender-voting/blob/master/src/ts/anysender-utils.ts#L88) function to handle sending a request to the any.sender service: 

```
checkBalance(wallet: Wallet) 
```

It will contact the any.sender service with the signer's address and return the customer's balance.

Our backend is simply. It just tallies all deposits (alongside pending/spent relay transactions) to work out the current balance. 

### Preparing the Relay Transaction for any.sender

How do we send a job up to the any.sender service? We've created a relay transaction format that is *similar* to how transactions are dealt with today: 

```
    --- Signed Relay Transaction --- 
    readonly from: string; // The address sending the transaction
    readonly to: string; // The address the transaction is sent to
    readonly gas: number; // The amount of gas allocated for the transaction
    readonly data: string; // The data to supply when sending the transaction
    readonly deadlineBlockNumber: number; // A deadline before which a transaction must be mined 
    readonly refund: string; // How much to refund the user by, in wei.
    readonly relayContractAddress: string; // Our relay.sol contract 
    readonly signature: string; // Customer's signature to authorise relay
    
    
 ```
 
As we can see, it is a relatively straight forward transaction format. 

- *To & From:* Who authorised the transaction and what is the destination contract address? 

- *Gas & Data:* How much gas can we use? And what is the calldata that should be executed at the destination contract? 

- *DeadlineBlockNumber & Refund:* What quality of service will the any.sender service provider? If the relay transaction does not get in the blockchai before the deadline, then the customer is entitled to the pre-agreed refund. 

- *RelayContractAddress:* All relay transactions are processed via the any.sender contract. The blockchain timestamps when the job was completed and this can be used as evidence if the any.sender service fails to provide its promised quality of service. 

A keen reader will hopefully notice two missing ingredients; 

- *No gas price?* As an any.sender operator, our job is to first send the transaction at a low fee (saving you money), but to gradually keep bumping the fee until the transaction gets in, so we can always beat congestion. 

- *No replay protection?* Our transaction format does not include replay protection. We must assume the replay protection is built into the smart contract (to:), otherwise anyone can copy and publish the calldata to perform replay attacks. We have provided in-depth recommendations on [how to incorporate replay protection](https://github.com/PISAresearch/metamask-comp) and in this example we have incorporated [Bitflip-ordering](https://github.com/stonecoldpat/anysender-voting/blob/master/src/ts/anysender-utils.ts#L48). 

OK so back to the story. We provide a simple utility function to easily fetch a signed relay transaction: 

```
getSignedRelayTx(
  gas: number,
  callData: string,
  refund: string,
  contract: Contract,
  wallet: Wallet,
  provider: Provider
) {
```

As long as the dapp developer can put together the callData [(super easy to do)](https://github.com/stonecoldpat/anysender-voting/blob/master/src/ts/vote.ts#L138), we'll wrap it up in such a way that the any.sender service can process it. 

### How Relay.sol processes the relay transaction 

OK. So we have put together a new signed relay transaction for the any.sender service. How do we get it in the blockchain?

Again, it is pretty easy. We can simply send the job to the any.sender service via [a rest-api]*https://github.com/stonecoldpat/anysender-voting/blob/master/src/ts/vote.ts#L161): 

```
const receipt = await anysender.executeRequest(signedRelayTx);

```

If the relay request is successful, then the any.sender service will sign the relay transaction and return it back as a signed receipt. 

This is the incredible part of the any.sender protocol. 

The customer has **cryptographic evidence the job was accepted** by the any.sender service and they will also have **blockchain evidence if the job was completed before the deadline** as Relay.sol timestamps all completed requests.

So if the any.sender service fails to provide the promised quality of service, then the receipt can be sent to the RefundAdjudicator.sol contract. There are two outcomes:

- *Refund:* The customer is refunded the pre-agreed amount according to the receipt. 
- *Slashed:* The any.sender service has an on-chain security deposit that will be slashed. 

**Why is this magical?** Well as the example demonstrates, it is a pretty straight-forward and simple way to relay transactions to the blockchain, and at the same time, the operator is held fully financially accountable for their actions. If a quality of service is not delivered, then the operator must refund the customer or get slashed (e.g. fined). This smart contract-enforced accountable is the future of Ethereum and now it is ready to try. So give it a shot. 


