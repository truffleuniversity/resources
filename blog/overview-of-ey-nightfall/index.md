---
title: 'Overview of Nightfall'
date: '2019-06-13'
description: 'A detailed look at EY Nightfall, what it is and how it works.'
author: 'Kyle Liu'
---

By: [Kyle L](https://medium.com/@kyle_59823)

In October 2018, Ernst & Young introduced Nightfall at Ethereum Devcon in Prague. On May 31st, 2019, EY released [Nightfall](https://github.com/EYBlockchain/nightfall) into the public domain without the usual copyrights / licensing that frequently accompany open-source software. Nightfall enables the private transfer of ERC-20 and ERC-721 tokens on the Ethereum mainnet.

## Setting up

The software achieves transactional privacy by leveraging [zk-SNARKs](https://z.cash/technology/zksnarks/) using [ZoKrates](https://github.com/Zokrates/ZoKrates) to hide the `_to` and `_value` arguments of a transfer function. The current method for zero-knowledge proofs to be stored and verified efficiently over a blockchain relies on having a set of public parameters for all parties to use for producing proofs. Read about ZCash’s generation of their public parameters [here](https://z.cash/technology/paramgen/). Nightfall utilizes a “trusted benefactor” (referred to as “Tom” in the whitepaper) to perform its parameter generation process, known as the “Trusted Setup.” I assume that the trusted benefactor can be an individual or a collective, and is the entity responsible for producing the public parameters and deploying the necessary contracts. Nightfall features six main computations:

```
NFTokenShield.mint(_proof,_inputs,_vkId)
NFTokenShield.transfer(_proof,_inputs,_vkId)
NFTokenShield.burn(payTo,_proof,_inputs,_vkId)
FTokenShield.mint(_proof,_inputs,_vkId)
FTokenShield.transfer(_proof,_inputs,_vkId)
FTokenShield.burn(payTo,_proof,_inputs,_vkId)
```

All six functions each require the “Trusted Setup” to compute a pair of keys: the verification key, and the proving key. The six verification keys are checked into a [zk-SNARK Verifier Registry](http://eips.ethereum.org/EIPS/eip-1923) in exchange for `vkIds`, which are then shared along with the proving keys publicly for users to use in their proofs (created when users call one of the functions).

Tom proceeds to deploy the Shield contracts (I believe it’s called a Shield contract because it’s “shielding” the transaction from watchful eyes) `NFTokenShield.sol` and `FTokenShield.sol` onto Ethereum mainnet. In doing so, he chooses the type of ERC-20 token (ZRX, MKR, BAT, etc…) and the type of ERC-721 token (ENS, CryptoKitties, etc…) that the respective shield contracts will support. I assume that each instance of a shield contract can only support a single type of token and different instances of shield contracts will need to be deployed to accommodate different types. Tom then shares the Ethereum addresses of the two shield contracts.

## Nightfall

The main workflow is simple: Mint => Transfer => Burn. The structure for the following three sections will be a breakdown of each function in detail as it pertains to ERC-721s. Each section will include a sub-section explaining how the function differs for ERC-20s. Once again, we will follow the age-old tale of Alice and Bob. Alice seeks to use Nightfall in order for the following three things to become private:

1.  All details of the ERC-721 token (the asset being transferred)
2.  The identity of the sender (Alice)
3.  The identity of the recipient (Bob)

## Mint

Alice yearns to transfer ownership of her ERC-721 token to Bob in secret. She begins by converting her ERC-721 token into a private ERC-721 commitment, an act otherwise known as “minting.” Alice can achieve this with the Nightfall UI; I will attempt to provide a slightly simplified version of the steps:

Some definitions:

`σ` = a randomly generated salt  
`Z_A` = Private commitment token representing Alice’s ERC-721 token  
`α` = The ERC-721 token id representing the asset being minted  
`pk_ZA` = Alice’s public key for the private commitment `Z_A`  
`x` = public inputs = `(α, Z_A )`  
`w` = private inputs = `(pk_ZA, σ)`  
`π` = proof of knowledge that `Z_A` does, in fact, hide the asset `α`  
`h()` = sha256

1.  The client computes a commitment token `Z_A: = h( α | pk_ZA | σ)` (This is just a string concatenation of `α`, `pk_ZA` and `σ` fed into sha256)
2.  The client computes the zk-SNARK pair `(π, x)` and sends it off to the Shield contract. It does so by selecting a set of arithmetic constraints `C` to generate a proof `π` such that `C` is satisfied given the inputs `x` and `w`. `C` itself is satisfied if and only if the following condition is true: `Z_A = h( α | pk_ZA | σ)` (proof that `Z_A` does in fact hide `α` )
3.  Shield contract verifies the validity of `(π, x)` through the use of a Verifier contract if the proof checks out, it will:
    - execute the transfer of `α`, on behalf of Alice, to hold in escrow in the Shield Contract
    - Add `Z_A` to the next empty leaf in the contract’s Merkle Tree
    - Recalculate the path to the root of the Merkle Tree from `Z_A` and gives the `leafindex` of `Z_A` back to the caller. (The on-chain Merkle tree is represented by a flattened array, so the `leafindex` is just the index in this array)
4.  Alice stores this `leafindex` of `Z_A` along with other pertinent information in a local instance of MongoDB.

_I will attempt to address security/privacy concerns in a later section. The software does come with many security warnings, and the Nightfall whitepaper makes clear that privacy is NOT achieved during mint._

### How minting differs for ERC-20 tokens

Essentially the only difference here is that the asset `α` is replaced with `e`, which represents the value of the ERC-20 token being minted. The caller sends the zk-SNARK pair `(π, x)` to `FTokenShield.mint` instead of `NFTokenShield.mint`.

## Transfer

Alice successfully mints her ERC-721 token in the section above and is now ready to transact privately. Recall that Alice wanted the following three things to become private with the transfer:

1.  All details of the ERC-721 token
2.  The identity of the sender (Alice)
3.  The identity of the recipient (Bob)

It will be during and only during transfer, that the above three things are ‘shielded’ from prying eyes. However, before the transfer can happen, Bob must first register his ‘zkp’ public key as well as his Whisper public key against his Ethereum address with a PKD (Public Key Directory). Alice will look up Bob’s Ethereum address in the PKD to retrieve Bob’s public keys. The transfer process (again slightly simplified) is as follows:

Some more definitions for reference:

`σ` = the salt that Alice used in mint  
`σ_AB` = new salt that Alice will pass to Bob   
`Z_B`\= The private token commitment calculated by Alice for Bob, with Bob’s public key and the new salt  
`α` = The ERC-721 token id representing the asset being transferred  
`pk_ZB` = Bob’s zkp public key that he registered against his Ethereum address in a PKD. Alice will use this public key to create the `Z_B` private commitment for Bob.   
`pk_ZA` = Alice’s public key for the private commitment `Z_A`  
`sk_ZA` = Alice’s secret key for the private commitment `Z_A`  
`N_A` = The nullifier of Alice’s commitment `Z_A`  
`N` = The list of nullifiers that have been used  
`root` = The new Merkle root in the contract  
`roots` = The list of roots stored on the Contract logging the new root every time it’s recalculated  
`sp_ZA` = The sister path to the ZA to the Merkle root  
`x` = public inputs to a zk-SNARK = `(N_A, root, Z_B)`  
`w` = private inputs to a zk-SNARK = `(α, sp_ZA, sk_ZA, σ, pk_ZB, σ_AB)`  
`C` = the arithmetic circuit `C: (w,x) -> {0,1}`  
`pC` = proving key for the arithmetic circuit `C`  
`π` = proof for the circuit C, public inputs `x` and private inputs `w`  
`h()` = sha256

1.  Alice must first look up Bob’s zkp public key `pk_ZB` in a Public Key Directory.
2.  Compute the commitment token `Z_B: = h( α | pk_ZB | σ_AB)` (Notice that this new commitment token contains the same asset, but Alice uses Bob’s zkp public key instead of her own, she also uses a new salt `σ_AB` which she will pass to Bob through Whisper)
3.  Compute `N_A: = h( σ | sk_ZA)`, the nullifier of Alice’s `Z_A` commitment
4.  Grab the new `root` to the on-chain Merkle tree as well as the ‘sister path’ to the commitment token `Z_A` from the Shield contract and use them to set public input `x = (N_A, root, Z_B)` and private input `w = (α, sp_ZA, sk_ZA, σ, pk_ZB, σ_AB)`
5.  The client computes the zk-SNARK pair `(π, x)` and sends it off to the Shield contract. It does so by selecting a set of arithmetic constraints `C` to generate a proof `π` such that `C` is satisfied given the inputs `x` and `w`. `C` itself is satisfied if and only if the following five conditions are true:

    - `pk_ZA = h(sk_ZA);` (proof of Alice’s knowledge of the secret key to `pk_ZA`)
    - `Z_A = h( α | pk_ZA | σ)` (This is the same as the satisfying condition of the constraint `C` in ‘mint’)
    - Proof that `Z_A` belongs on the on-chain Merkle Tree
    - `N_A = h( σ | sk_ZA);` (Proof that `N_A` is indeed the nullifier to `Z_A`)
    - `Z_B = h( α | pk_ZB | σ_AB);` (Proof that `Z_B` contains the same asset as `Z_A`)

6.  Shield contract verifies the validity of `(π, x)` through the use of a Verifier contract and if the proof checks out, it will:

    - Check that the `root` provided by the caller is in `roots` (fail if not)
    - Check that `N_A` is not in the list of already used nullifiers `N` (fail if not)
    - Add `Z_B` to the next empty leaf of the on-chain Merkle Tree
    - Recalculate the path to the root from `Z_B`
    - Append new `root` to `roots`
    - Append `N_B` to the list of used nullifiers `N`
    - Pass the `leafindex` of `Z_B` back to the caller

7.  Alice stores this `leafindex` of `Z_B` along with other pertinent information in a local instance of MongoDB.

8.  Alice then sends Bob several things: the salt `σ_AB`, the public key of Bob `pk_ZB` that Alice used to produce `Z_B`, the ERC-721 token id `α`, `Z_B` itself, and the `leafindex` of `Z_B` store on the Merkle tree of the Shield contract all via [Whisper](https://github.com/ethereum/wiki/wiki/Whisper).

9.  Bob can now verify the correctness of the information provided by Alice for himself. He can also store relevant data in his local instance of MongoDB, including information on whether or not Alice’s information was valid.

Alice and Bob have been through quite the ordeal to get here. Alice just successfully transferred ownership of her ERC-721 token to Bob under the veil of the Shield contract. **It is important to note that the asset can now be transferred indefinitely to any number of recipients under zero knowledge within the protection of the shield contract.** In this very moment, no one except for Alice and Bob knows who the new owner of Alice’s ERC-721 token is. That is of course until Bob decides to ‘burn’ the private commitment `Z_B` in exchange for the asset.

### How transfer differs for ERC-20 tokens

For ERC-20 tokens, the `FTokenShield.transfer` function requires TWO inputs and TWO outputs (Unlike `NFTokenShield.transfer` which takes in one private commitment `Z_A` and outputs the private commitment of Bob `Z_B`). `FTokenShield.transfer` instead require two private commitments from the sender totaling to more than the amount being transferred, and the two outputs are the amount transferred to Bob, and Alice’s change. The whitepaper specifically states several reasons for this:

- Due to the nature of zk-SNARKs, having multiple permutations of the number of inputs of outputs means having to perform the “Trusted Setup” on each permutation to generate the appropriate verification keys. To avoid this complexity at this stage, the developers chose to support only the 2 outputs, 2 inputs solution for now.
- Having only one output requires the sender to own commitments which sum up to exactly the amount required by the recipient (so that there would be no change).
- Having a single input allows observers to infer more information from watching the shield contract.

For Alice, this means she needs to generate 2 private commitments (including 2 new salts), 1 for Bob, and 1 for herself to give herself change. She also needs to generate 2 nullifiers, one for each of her initial commitments. The rest of the protocol follows suit and handles the extra input and output as one would expect.

## Burn

With Alice out of the picture, all that’s left to do is for Bob to burn the private commitment `Z_B` in exchange for the actual ERC-721 token from the Shield contract. In order to release the asset from escrow, Bob will have to prove to the Shield contract he knows the secret key to `Z_B`. He performs the following:

Some familiar definitions for reference:

`σ` = a randomly generated salt  
`Z_B` = The private commitment token representing Alice’s ERC-721 token  
`α` = The ERC-721 token id representing the asset being minted  
`sk_ZB` = Bob’s secret key for the private commitment `Z_B`  
`pk_ZB` = Bob’s public key for the private commitment `Z_B`  
`sp_ZB` = the sister path of Z_B for the on-chain Merkle tree  
`N` = list of nullifiers that have already been used.   
`x` = public inputs = `(α, N_B, root)`  
`w` = private inputs = `(sp_ZB, sk_ZB, σ_AB)`  
`π` = proof of knowledge that `Z_A` does, in fact, hide the asset `α`  
`h()` = sha256

1.  Compute `N_B: = h( σ | sk_ZB)`, the nullifier of Bob’s `Z_B` commitment (Recall that Alice had to compute `N_A` for her private commitment `Z_A` when she transferred the asset to Bob)
2.  Grab the new `root` to the on-chain Merkle tree as well as the ‘sister path’ to the commitment token `Z_B` from the Shield contract and use them to set public input `x = (α, N_B, root)` and private input `w = (sp_ZB, sk_ZB, σ_AB)`
3.  The client computes the zk-SNARK pair `(π, x)` and sends it off to the Shield contract. It does so by selecting a set of arithmetic constraints `C` to generate a proof `π` such that `C` is satisfied given the inputs `x` and `w`. `C` itself is satisfied if and only if the following conditions are true:

    - `pk_ZB = h(sk_ZB);` (Proof that Bob has the correct secret key to `Z_B`)
    - `Z_B = h( α | pk_ZB | σ_AB);` (Proof that the asset, the public key Bob provided, and the salt that Alice gave to Bob do in fact produce `Z_B`)
    - Proof that `Z_B` belongs on the on-chain Merkle Tree
    - `N_B = h( σ | sk_ZB);` (Proof that `N_B` is the nullifier of `Z_B`)

4.  Shield contract verifies the validity of `(π, x)` through the use of a Verifier contract and if the proof checks out, it will:

    - Check that the `root` provided by Bob is in the list of `roots`. (fail if not)
    - Check that `N_B` is not in the list of already used nullifiers `N` (fail if already in `N`)
    - Execute the transfer of the token `α` to the `payTo` Ethereum address that Bob specifies.
    - Append `N_B` to the list of used nullifiers `N`

5.  Bob can now store any relevant data in his local instance of MongoDB

### How Burn differs for ERC-20 tokens

Essentially the only difference here is that the asset `α` is replaced with `e`, which represents the value of the ERC-20 token being burned. The caller sends the zk-SNARK pair `(π, x)` to `FTokenShield.burn` instead of `NFTokenShield.burn`.

## Privacy + Security Concerns

_None of what I’m saying in this section is news. There are security and privacy warnings plastered all over the documentation letting readers know the limitations of the system. I chose to include this information as a separate section to not distract from the main purpose of explaining how Nightfall works._

Of the three main functions in the workflow (Mint, Transfer, and Burn), Transfer is the only function which shrouds the asset and the identities of the sender and recipient under the cover of privacy. Any eyes watching the Shield contracts can see activity from Ethereum addresses minting and burning assets/tokens. The only way to truly hide the identity of the sender is for the sender to mine ether into a never-before-used Ethereum address. The whitepaper mentions a solution to use delegated proxies/transactions to interact with the Shield contract which will need to be implemented in a future release.

I repeatedly dropped this line “_Someone_ can now store any relevant data in _his/her_ local instance of MongoDB” without any explanation. I didn’t want to have to explain that the secret keys for spending the token commitments are actually just stored in a local instance of MongoDB. You can find the schema [here](https://github.com/EYBlockchain/nightfall/tree/master/database/src/models) to see what exactly is stored. This obviously isn’t secure and will need to change for use in production.

## Resources

I wrote this blog post with the intention to learn about EY Nightfall by writing about it. I mainly used the [whitepaper](https://github.com/EYBlockchain/nightfall/blob/master/doc/whitepaper/nightfall-v1.pdf) and the [GitHub code base](https://github.com/EYBlockchain/nightfall) as reference. Thanks for reading! Perhaps in the future I will do a deep dive into exactly how the zk-SNARK pair `(π, x)` is generated. In the mean time, here are some resources if you would like to learn more about the technology:

- [Z-Cash series explaining SNARKs](https://electriccoin.co/blog/snark-explain)
- [Christian Reitwiessner — zk-SNARKs in a nutshell](https://blog.ethereum.org/2016/12/05/zksnarks-in-a-nutshell/)
- [Vitalik Buterin on quadratic arithmetic programs](https://medium.com/@VitalikButerin/quadratic-arithmetic-programs-from-zero-to-hero-f6d558cea649) (part 1)
- [Vitalik Buterin on exploring elliptic curve pairings](https://medium.com/@VitalikButerin/exploring-elliptic-curve-pairings-c73c1864e627) (part 2)
- [Vitalik Buterin on zk-Snarks](https://medium.com/@VitalikButerin/zk-snarks-under-the-hood-b33151a013f6) (part 3)
- [PGHR13](https://eprint.iacr.org/2013/279.pdf)
- [GM17](https://eprint.iacr.org/2017/540.pdf)
- [Whisper](https://github.com/ethereum/wiki/wiki/Whisper)
