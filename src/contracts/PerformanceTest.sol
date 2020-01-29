pragma solidity ^0.5.11;

contract PerformanceTest {
    uint public noHashes = 0;
    uint public noCalls = 0;
    event Hash(bytes32 h, uint noHashes, uint noCalls);

    function test(uint _j) public {
        noCalls = 0;
        bytes32 h = keccak256(abi.encode("start"));
        for(uint i=0; i<_j; i++) {
            noHashes = noHashes + 1;
            h = keccak256(abi.encode("wasting gas", h));
        }

        emit Hash(h, noHashes, noCalls);
    }
}