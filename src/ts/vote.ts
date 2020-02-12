import { ethers, Wallet, Contract } from "ethers";
import { BallotFactory } from "../../out/BallotFactory";
import { Provider } from "ethers/providers";
import {
  defaultAbiCoder,
  keccak256,
  BigNumber,
  parseEther
} from "ethers/utils";

import {
  onchainDepositFor,
  getAnySenderClient,
  subscribe,
  getReplayProtection,
  getSignedRelayTx
} from "./anysender-utils";

// This account has ETHER to top up the any.sender service
const adminMnemonic = "12 word seed";

// This account has NO ETHER and must send transactions via any.sender
const voterMnemonic = "12 word seed";

/**
 * Set up the provider and wallet
 */
async function setup() {
  const infuraProvider = new ethers.providers.InfuraProvider(
    "ropsten",
    "<pk here>"
  );

  const adminMnemonicWallet = ethers.Wallet.fromMnemonic(adminMnemonic);
  const adminWallet = adminMnemonicWallet.connect(infuraProvider);

  const voterMnemonicWallet = ethers.Wallet.fromMnemonic(voterMnemonic);
  const voterWallet = voterMnemonicWallet.connect(infuraProvider);

  return {
    voterWallet: voterWallet,
    adminWallet: adminWallet,
    provider: infuraProvider
  };
}

/**
 * Deploy performance test contract to the network
 * @param wallet Signer
 * @param provider InfuraProvider
 */
async function deployBallotContract(
  wallet: Wallet,
  provider: Provider
): Promise<Contract> {
  const ballotFactory = new BallotFactory(wallet);
  const ballotFactoryTx = ballotFactory.getDeployTransaction([
    keccak256(
      defaultAbiCoder.encode(
        ["string"],
        ["Should Satoshi Nakamoto reveal their real-world identity?"]
      )
    )
  ]);
  const response = await wallet.sendTransaction(ballotFactoryTx);
  const receipt = await response.wait(6);

  const ballot = new ethers.Contract(
    receipt.contractAddress,
    ballotFactory.interface.abi,
    provider
  );

  return ballot;
}

/**
 * Admin registers a voter in the voting contract
 * @param ballot Contract
 * @param adminWallet Admin signer
 * @param voterWallet Voter signer
 */
async function setupVoter(
  ballot: Contract,
  adminWallet: Wallet,
  voterWallet: Wallet
) {
  const txResponse = await ballot
    .connect(adminWallet)
    .giveRightToVote(voterWallet.address);

  // Wait for 6 confirmations
  await txResponse.wait(2);
}
/**
 * Cast a vote via the any.sender service
 * @param performanceTestAddr Performance Test Contract address
 * @param wallet Signer
 * @param provider InfuraProvider
 */
async function castVote(ballot: Contract, wallet: Wallet, provider: Provider) {
  const anysender = await getAnySenderClient();

  // Vote to cast...
  const voteForProposal = new BigNumber("0");

  // Authenticate contract parameters!
  const msgHash = keccak256(
    defaultAbiCoder.encode(
      ["address", "uint"],
      [ballot.address, voteForProposal]
    )
  );

  // Local dapp developer can wrap this into a function
  // Just the replay-protection with bitflip-ordering
  // Tip: Don't care about concurrent transactions?
  // Can just increment nonce and keep bitmap/index zero.
  const nonce = new BigNumber("0"); // Bitmap index
  const bitmap = new BigNumber("0"); // Empty bitmap
  const index = new BigNumber("5"); // Flip the 5th bit

  // Encoded and signed replay protection
  const replayprotection = await getReplayProtection(
    msgHash,
    nonce,
    bitmap,
    index,
    ballot,
    wallet
  );

  // What function are we calling? And what are the arguments?
  // Let's encode this nice little packet up.
  const callData = ballot.interface.functions.vote.encode([
    voteForProposal,
    wallet.address,
    replayprotection
  ]);

  // Creates the unsigned relay transaction
  const signedRelayTx = await getSignedRelayTx(
    1000000, // Gas limit
    callData, // Encoded call data
    parseEther("0.000000001").toString(), // Requested Refund (if fails)
    ballot, // Ballot contract
    wallet, // Signer
    provider // InfuraProvider
  );

  // Let's sign it and send it off!
  const txReceipt = await anysender.relay(signedRelayTx);

  // Receipt of any.sender
  console.log(txReceipt);

  // Waits until the RelayTxID is confirmed via Relay.sol
  await subscribe(signedRelayTx, wallet, provider);

  // Let's confirm the voter is registered
  console.log(await ballot.voters(wallet.address));
}

(async () => {
  // Set up wallets & provider
  const { voterWallet, adminWallet, provider } = await setup();
  console.log("Admin: " + adminWallet.address);
  console.log("Voter: " + voterWallet.address);

  // Deposit to any.sender
  console.log(
    "Admin deposits 0.5 ether into the any.sender contract for the voter"
  );
  await onchainDepositFor(parseEther("0.5"), adminWallet, voterWallet);
  console.log("Deposit processed.");

  console.log("Deploy ballot contract.");
  const ballot = await deployBallotContract(adminWallet, provider);
  console.log("Ballot contract: " + ballot.address);

  console.log("Admin registers voter");
  await setupVoter(ballot, adminWallet, voterWallet);

  console.log("Voter casts vote -- using the any.sender service");
  await castVote(ballot, voterWallet, provider);

  console.log("One small step for satoshi. One giant leap for mankind.");
})().catch(e => {
  console.log(e);
  // Deal with the fact the chain failed
});
