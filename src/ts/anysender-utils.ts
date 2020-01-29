import { Wallet, Contract, ethers } from "ethers";
import { defaultAbiCoder, BigNumber, keccak256, arrayify } from "ethers/utils";
import { Provider } from "ethers/providers";
import { RelayFactory } from "@any-sender/contracts";
import AnySenderClient from "@any-sender/client";
import { RelayTransaction } from "@any-sender/data-entities";

export const MINIMUM_ANYSENDER_DEADLINE = 12;
const ANYSENDER_BALANCE_URL = "18.188.185.156";
const ANYSENDER_RELAY_URL =
  "https://y9g7myp1zl.execute-api.us-east-2.amazonaws.com/Stage";
const ANYSENDER_PORT = "5399";
const ANYSENDER_BALANCE = "/balance/";
const ANYSENDER_ADDR = "0xE25ec6cB37b1a37D8383891BC5DFd627c6Cd66C8";
const RECEIPT_ADDR = "0xe41743ca34762b84004d3abe932443fc51d561d5";
const DEPOSIT_CONFIRMATIONS = 11;

/**
 * Deposit coins into any.sender contract.
 * @param wallet Signer
 * @param provider InfuraProvider
 */
export async function onchainDeposit(toDeposit: BigNumber, wallet: Wallet) {
  const tx = await wallet.sendTransaction({
    to: ANYSENDER_ADDR,
    value: toDeposit
  });

  await tx.wait(DEPOSIT_CONFIRMATIONS);
}

/**
 * Fetch an any.sender client instance
 */
export async function getAnySenderClient() {
  return new AnySenderClient(ANYSENDER_RELAY_URL, ANYSENDER_ADDR, RECEIPT_ADDR);
}

/**
 * Compute an encoded replay protection blob to use for the meta-transaction
 * @param msgHash Hash of transaction data (e.g. parameters for the function call)
 * @param nonce Index of the bitmap
 * @param bitmap Bitmap from contract
 * @param indexToFlip Index to flip in the bitmap
 * @param contract Contract supports meta-transactions
 * @param wallet Signer
 */
export async function getReplayProtection(
  msgHash: string,
  nonce: BigNumber,
  bitmap: BigNumber,
  indexToFlip: BigNumber,
  contract: Contract,
  wallet: Wallet
) {
  const toFlip = flipBit(bitmap, indexToFlip);

  // Signer issues a command for the 0th index of the nonce
  const encoded = defaultAbiCoder.encode(
    ["address", "bytes32", "uint", "uint"],
    [contract.address, msgHash, nonce, toFlip]
  );

  const h = keccak256(encoded);
  const sig = await wallet.signMessage(arrayify(h));

  const replayProtection = defaultAbiCoder.encode(
    ["uint", "uint", "bytes"],
    [nonce, toFlip, sig]
  );

  return replayProtection;
}

/**
 * Flip a bit!
 * @param bits 256 bits
 * @param toFlip index to flip (0,...,255)
 */
function flipBit(bits: BigNumber, indexToFlip: BigNumber): BigNumber {
  return new BigNumber(bits).add(new BigNumber(2).pow(indexToFlip));
}

/**
 * Returns the signer's balance on any.sender
 * @param wallet Signer
 */
export async function checkBalance(wallet: Wallet) {
  const balanceUrl =
    "http://" +
    ANYSENDER_BALANCE_URL +
    ":" +
    ANYSENDER_PORT +
    ANYSENDER_BALANCE +
    wallet.address;

  const res = await fetch(balanceUrl);

  if (res.status > 200) {
    throw new Error("Bad response from server");
  }

  return await res.json();
}

/**
 * Fetches an unsigned relay transaction
 * @param gas Gas limit
 * @param callData Calldata to be executed
 * @param refund Requested refund (if fails)
 * @param contract Contract
 * @param wallet Signer
 * @param provider InfuraProvider
 */
export async function getUnsignedRelayTx(
  gas: number,
  callData: string,
  refund: string,
  contract: Contract,
  wallet: Wallet,
  provider: Provider
) {
  const blockNo =
    (await provider.getBlockNumber()) + MINIMUM_ANYSENDER_DEADLINE;

  const unsignedRelayTx = {
    from: wallet.address,
    to: contract.address,
    gas: gas,
    data: callData,
    deadlineBlockNumber: blockNo,
    refund: refund,
    relayContractAddress: ANYSENDER_ADDR
  };

  const relayTxId = await getRelayTxID(unsignedRelayTx);
  const signature = await wallet.signMessage(arrayify(relayTxId));

  const signedRelayTx: RelayTransaction = {
    ...unsignedRelayTx,
    signature: signature
  };

  return signedRelayTx;
}

/**
 * Returns a Promise that resolves when the RelayTxID is detected in the Relay.sol contract.
 * @param relayTxId Relay Transaction ID
 * @param wallet Signer
 * @param provider InfuraProvider
 */
export async function subscribe(
  relayTxId: string,
  wallet: Wallet,
  provider: Provider
) {
  const anysender = await getAnySenderClient();
  const blockNo = await provider.getBlockNumber();
  const topic = ethers.utils.id(
    "RelayExecuted(bytes32,bool,address,uint256,uint256)"
  );

  const filter = {
    address: anysender.relayContractAddress,
    fromBlock: blockNo - 2,
    topics: [topic]
  };

  return new Promise(resolve => {
    provider.once(filter, result => {
      const relay = new RelayFactory(wallet).attach(
        anysender.relayContractAddress
      );

      const recordedRelayTxId = relay.interface.events.RelayExecuted.decode(
        result.data,
        result.topics
      ).relayTxId;

      if (relayTxId == recordedRelayTxId) {
        console.log("Found: " + relayTxId);
        resolve();
      }
    });
  });
}

/**
 * Compute a relay transaction ID
 * @param relayTx Relay Transaction ID
 */
export async function getRelayTxID(relayTx: {
  to: string;
  from: string;
  gas: number;
  data: string;
  deadlineBlockNumber: number;
  refund: string;
  relayContractAddress: string;
}): Promise<string> {
  const messageEncoded = defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint", "uint", "uint", "address"],
    [
      relayTx.to,
      relayTx.from,
      relayTx.data,
      relayTx.deadlineBlockNumber,
      relayTx.refund,
      relayTx.gas,
      relayTx.relayContractAddress
    ]
  );
  return keccak256(messageEncoded);
}
