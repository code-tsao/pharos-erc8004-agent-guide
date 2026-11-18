# Sources and attribution

This repository documents independent ERC-8004 registries deployed on Pharos Atlantic Testnet. It is not the upstream ERC-8004 project, and upstream SDK/explorer support for these addresses is not implied.

- Protocol: [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004), published under CC0. The specification remains a draft.
- Registry implementation and ABI provenance: [erc-8004/erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts/tree/b9e466c250744a7e06b13dff9d3c2844ed64f825), commit `b9e466c250744a7e06b13dff9d3c2844ed64f825`. The Solidity sources carry MIT SPDX identifiers. The JSON ABIs here were exported from the compiled, unchanged registry implementations; no upstream Solidity code is bundled here.
- Build used for the deployed implementations: Solidity 0.8.24, OpenZeppelin 5.4.0, optimizer 200 runs, viaIR, Paris EVM target. A separate deployment bootstrap establishes our own upgrade administrator.
- [Pharos network documentation](https://docs.pharos.xyz/getting-started/network/atlantic-testnet) provides the public network settings.
- [ethers v6](https://docs.ethers.org/v6/) is the example's runtime dependency, pinned to version 6.17.0 in its lockfile.

The guide and example code in this repository are MIT licensed; see [LICENSE](LICENSE). Dependency licenses remain with their respective authors.
