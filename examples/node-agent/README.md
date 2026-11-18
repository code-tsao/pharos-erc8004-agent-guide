# Node.js agent registration example

Register an agent on Pharos Atlantic Testnet, publish its metadata, and use the deployed ERC-8004 Reputation and Validation registries. See the [full guide](../../README.md) for contract addresses, API details, and explanations of every script.

This example connects your existing agent's metadata and service endpoints to the registries. It supplies no model or agent runtime, and this repository contains no contract deployment project.

## Set up

Use Node.js **22.13 or later**. From this directory:

```bash
npm ci
cp .env.example .env
npm test
```

`npm test` runs offline checks and sends no public-chain transactions.

Edit `.env` locally. Set `OWNER_PRIVATE_KEY` to a dedicated testnet wallet's `0x`-prefixed private key. For feedback, set `REVIEWER_PRIVATE_KEY` to a separate wallet that is neither the agent owner nor an approved operator. Fund both with Atlantic native test gas on chain **688689**. Keep keys local and out of Git or browser bundles; never use the registry administrator's key.

## Register and publish

```bash
npm run check
npm run register
```

`check` is read-only and needs no private key. `register` sends a transaction and saves the new identity in `agent.json`, plus starter metadata in `agent-registration.json`.

Edit `agent-registration.json` with your agent's name, description, and actual service endpoints. Keep `active: false` until the service works. Then publish the metadata and submit a review from the reviewer wallet:

```bash
npm run publish-metadata
npm run feedback
npm run read
```

`publish-metadata` and `feedback` send transactions. `read` is read-only. The registration file's full registry identifier and agent ID identify this agent; an ID of `0` is valid.

## Optional operations

| Command | Setup and effect |
| --- | --- |
| `npm run revoke` | Original reviewer sends a transaction revoking the saved feedback |
| `npm run set-wallet` | Set `RECEIVING_PRIVATE_KEY`; the receiving wallet signs, and the owner pays to update the wallet association |
| `npm run validation:request` | Set a separate `VALIDATOR_ADDRESS`; the agent owner/operator sends a validation request |
| `npm run validation:response` | Set that validator's `VALIDATOR_PRIVATE_KEY`; the funded validator sends the demonstration response |
| `npm run validation:read` | Read the saved request's status and matching summary without sending a transaction |

The receiving wallet needs no gas merely to sign. For validation, the requester needs only the validator's public address; its private key belongs on the validator's machine. When using separate machines, transfer the nonsecret `agent.json` and `validation.json` records as described in the full guide.

Validation is experimental. These scripts demonstrate recording a request and a score; they supply no independent computation check, TEE/ZK verifier, or staking mechanism. Replace the demonstration response with your validator's actual assessment before using it as an application signal.

## Keep the recovery files

Preserve `agent.json`, `agent-registration.json`, `feedback.json`, and `validation.json` locally. They connect subsequent commands to the correct on-chain records. Publishing a metadata update uses the existing ID; rerunning registration creates another NFT.

If a write times out, inspect its printed transaction hash and receipt before retrying. A timeout does not mean failure. Do not delete recovery files or blindly repeat a mint, review, or validation request to recover from an error.
