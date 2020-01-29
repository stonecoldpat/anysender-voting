pragma solidity ^0.5.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/cryptography/ECDSA.sol";

contract MetaTransaction {
    mapping(address => mapping(uint => uint)) public bitmaps;
    mapping(address => uint) public nonces;

    /**
     * Supports up to 256 concurrent transactions.
     * Supports ordered transactions by nonce.

     * @param _msgHash Application-specific content
     * @param _signer Approver's address
     * @param _replayprotection An encoding of abi.encode(['uint','uint','bytes'], nonce1, nonce2, _sig);
     */
    function isMetaTransactionApproved(bytes32 _msgHash, address _signer, bytes memory _replayprotection) public {

        // Decode replay protection details
        (uint _nonce, uint _toFlip, bytes memory _sig) = abi.decode(_replayprotection, (uint, uint, bytes));

        // EIP712 can be included in "h", no need to enforce in standard.
        bytes32 h = keccak256(abi.encode(address(this), _msgHash, _nonce, _toFlip));
        require(_signer == ECDSA.recover(ECDSA.toEthSignedMessageHash(h), _sig), "Bad signature");
        require(bitmaps[_signer][_nonce] & _toFlip != _toFlip, "Nonce already flipped.");
        require(_nonce == nonces[_signer] || _nonce == nonces[_signer]+1, "Nonce must be the same or incremented by one");
        bitmaps[_signer][_nonce] = bitmaps[_signer][_nonce] | _toFlip;

        // Delete old bitmap, keep new nonce
        if(_nonce == nonces[_signer]+1) {
            delete bitmaps[_signer][_nonce-1];
            nonces[_signer] = _nonce;
        }
    }

    // Used for simple testing. Not production-code.
    function isBitmapSet(address _signer, uint _nonce, uint _flip) public view returns (bool) {
        return bitmaps[_signer][_nonce] & _flip == _flip;
    }

}