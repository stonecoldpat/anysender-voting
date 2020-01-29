pragma solidity ^0.5.11;

import "./MetaTransaction.sol";

/// @title Voting with delegation.
contract Ballot is MetaTransaction {
    // This declares a new complex type which will
    // be used for variables later.
    // It will represent a single voter.
    struct Voter {
        uint weight; // weight is accumulated by delegation
        bool voted;  // if true, that person already voted
        address delegate; // person delegated to
        uint vote;   // index of the voted proposal
    }

    // This is a type for a single proposal.
    struct Proposal {
        bytes32 name;   // short name (up to 32 bytes)
        uint voteCount; // number of accumulated votes
    }

    address public chairperson;

    // This declares a state variable that
    // stores a \`Voter\` struct for each possible address.
    mapping(address => Voter) public voters;

    // A dynamically-sized array of \`Proposal\` structs.
    Proposal[] public proposals;

    event VoteRecorded(uint proposal, address voter);
    event RegisteredVoter(address voter);

    /// Create a new ballot to choose one of \`proposalNames\`.
    constructor(bytes32[] memory proposalNames) public {
        chairperson = msg.sender;
        voters[chairperson].weight = 1;

        // For each of the provided proposal names,
        // create a new proposal object and add it
        // to the end of the array.
        for (uint i = 0; i < proposalNames.length; i++) {
            // \`Proposal({...})\` creates a temporary
            // Proposal object and \`proposals.push(...)\`
            // appends it to the end of \`proposals\`.
            proposals.push(Proposal({
                name: proposalNames[i],
                voteCount: 0
            }));
        }
    }

    // Give \`voter\` the right to vote on this ballot.
    // May only be called by \`chairperson\`.
    function giveRightToVote(address voter) public {
        require(msg.sender == chairperson, "Only chairman can approve new voters");
        require(!voters[voter].voted, "Voter has already voted");

        voters[voter].weight = 1;
        emit RegisteredVoter(voter);
    }

    // Meta-transaction enabled vote
    function vote(uint proposal, address signer, bytes memory replayprotection) public {
        isMetaTransactionApproved(keccak256(abi.encode(address(this), proposal)), signer, replayprotection);
        castVote(proposal, signer);
    }

    /// Give your vote (including votes delegated to you)
    /// to proposal \`proposals[proposal].name\`.
    function castVote(uint proposal, address voter) internal {
        require(!voters[voter].voted, "Voter has already voted");
        voters[voter].voted = true;
        voters[voter].vote = proposal;

        // If \`proposal\` is out of the range of the array,
        // this will throw automatically and revert all
        // changes.
        proposals[proposal].voteCount += voters[voter].weight;

        emit VoteRecorded(proposal, voter);
    }

    /// @dev Computes the winning proposal taking all
    /// previous votes into account.
    function winningProposal() public view returns (uint) {
        uint winningVoteCount = 0;
        uint winner = 0;

        for (uint p = 0; p < proposals.length; p++) {
            if (proposals[p].voteCount > winningVoteCount) {
                winningVoteCount = proposals[p].voteCount;
                winner = p;
            }
        }

        return winner;
    }

    // Calls winningProposal() function to get the index
    // of the winner contained in the proposals array and then
    // returns the name of the winner
    function winnerName() public view returns (bytes32) {
        return proposals[winningProposal()].name;
    }
}