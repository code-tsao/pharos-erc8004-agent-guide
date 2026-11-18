# ERC-8004 on Pharos Atlantic Testnet

This guide and its runnable [Node.js example](examples/node-agent/) help you register an agent, publish its metadata, and integrate client feedback on Atlantic. It also covers optional validation requests, wallet integration, event indexing, and the contract interfaces needed to build your own application.

Use the existing registries below. Registering an agent is permissionless: you need your own funded testnet wallet, not access to the registry administrator or deployment project.

## Deployment and network

| Setting | Value |
| --- | --- |
| Network | Pharos Atlantic Testnet |
| Chain ID | `688689` (`0xa8231`) |
| HTTP RPC | `https://atlantic.dplabs-internal.com` |
| WebSocket RPC | `wss://atlantic.dplabs-internal.com` |
| Explorer | [Atlantic Pharosscan](https://atlantic.pharosscan.xyz/) |
| Identity registry — **proxy** | [0xF766d8B12d5A15A58cba4DCA51Cbb92F7f84a2BF](https://atlantic.pharosscan.xyz/address/0xF766d8B12d5A15A58cba4DCA51Cbb92F7f84a2BF) |
| Reputation registry — **proxy** | [0x205d489F78ef263ACcA1562DCE3FED4a170a3716](https://atlantic.pharosscan.xyz/address/0x205d489F78ef263ACcA1562DCE3FED4a170a3716) |
| Validation registry — **proxy** | [0x45983Ead2B48e69d57689ffdc6AE648482766537](https://atlantic.pharosscan.xyz/address/0x45983Ead2B48e69d57689ffdc6AE648482766537) |
| Contract version | `2.0.0` |

This is an independent deployment of the upstream ERC-8004 contracts. Configure these addresses explicitly in SDKs, frontends, and indexers. A client that defaults to the upstream `0x8004…` addresses will not query these registries and may find no contract at all. Registrations and reputation in this deployment do not automatically migrate elsewhere.

The complete registry identifier is:

```text
eip155:688689:0xF766d8B12d5A15A58cba4DCA51Cbb92F7f84a2BF
```

An agent's identity is this identifier **plus its `agentId`**. Store both. IDs start at `0`, and the same number in another registry identifies a different agent.

Download the [Identity ABI](abis/erc8004-atlantic-identity-abi.json), [Reputation ABI](abis/erc8004-atlantic-reputation-abi.json), and [Validation ABI](abis/erc8004-atlantic-validation-abi.json) for other languages or libraries. The tutorial includes the smaller ABI fragments it uses, so no ABI download is needed to follow it.

See [Atlantic network settings](https://docs.pharos.xyz/getting-started/network/atlantic-testnet) for RPC limits. The HTTP RPC URL accepts JSON-RPC requests; opening it in a browser is not a way to claim gas tokens.

## What you will build

1. Connect to the deployed contracts and check the network without a private key.
2. Register an agent and save the ID from its transaction receipt.
3. Publish its registration JSON through an on-chain data URI.
4. Submit feedback from a separate client wallet.
5. Read the agent and a reputation summary, then optionally revoke the feedback.

Identity is an ERC-721 NFT representing an agent. Reputation stores client feedback associated with that identity. Publishing an identity or feedback does not itself prove that an agent is reliable or that a claimed service exists.

## 1. Prepare a project and wallets

Install Node.js **22.13 or later** and npm, then clone the repository and open the included example:

```bash
git clone https://github.com/code-tsao/pharos-erc8004-agent-guide.git
cd pharos-erc8004-agent-guide/examples/node-agent
npm ci
npm test
cp .env.example .env
npm run check
```

`npm test` checks the guide, ABIs, and example files offline. `npm run check` checks the deployed registries without a private key or transaction. Keep all following commands in `examples/node-agent`.

Every JavaScript file shown below is already included in that directory. Read the code and run it; you do not need to recreate the files. The repository's `.gitignore` excludes private environment files and generated agent/review records. Keep your generated records locally for subsequent calls and recovery.

Fill the owner and reviewer fields in `.env` when you are ready to send the tutorial's transactions:

```dotenv
RPC_URL=https://atlantic.dplabs-internal.com
OWNER_PRIVATE_KEY=
REVIEWER_PRIVATE_KEY=
```

Use two dedicated testnet wallets you control:

| Wallet | Purpose |
| --- | --- |
| Owner | Registers the agent and updates its metadata |
| Reviewer | Submits feedback; must not be the agent owner or an approved operator |

Set each private key in `.env` as a `0x`-prefixed value. Keep this file private and out of frontend bundles. On macOS/Linux, run `chmod 600 .env`. Do not use the registry administrator's key or a mainnet wallet for this tutorial.

Fund both wallet addresses with Atlantic **native test gas** on chain `688689`, for example by transferring from an already funded Atlantic wallet. Tokens on Pacific mainnet or another testnet do not pay Atlantic transaction fees. Read-only steps work without keys or funds. A public Atlantic faucet is not assumed in this guide; confirm the faucet's target chain before using one.

## 2. Connect and check the deployment

The included `client.mjs` supplies the shared addresses, ABI fragments, network checks, and file helpers used by the remaining scripts.

<!-- file: client.mjs -->
```javascript
import { readFileSync } from "node:fs";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

export const CHAIN_ID = 688689;
export const IDENTITY_ADDRESS = "0xF766d8B12d5A15A58cba4DCA51Cbb92F7f84a2BF";
export const REPUTATION_ADDRESS = "0x205d489F78ef263ACcA1562DCE3FED4a170a3716";
export const AGENT_REGISTRY = `eip155:${CHAIN_ID}:${IDENTITY_ADDRESS}`;

export const identityAbi = [
  "function register() returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId,string newURI)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function isAuthorizedOrOwner(address spender,uint256 agentId) view returns (bool)",
  "function owner() view returns (address)",
  "function getVersion() pure returns (string)",
  "event Registered(uint256 indexed agentId,string agentURI,address indexed owner)",
];
export const reputationAbi = [
  "function getIdentityRegistry() view returns (address)",
  "function getVersion() pure returns (string)",
  "function giveFeedback(uint256 agentId,int128 value,uint8 valueDecimals,string tag1,string tag2,string endpoint,string feedbackURI,bytes32 feedbackHash)",
  "function readFeedback(uint256 agentId,address clientAddress,uint64 feedbackIndex) view returns (int128 value,uint8 valueDecimals,string tag1,string tag2,bool isRevoked)",
  "function getSummary(uint256 agentId,address[] clientAddresses,string tag1,string tag2) view returns (uint64 count,int128 summaryValue,uint8 summaryValueDecimals)",
  "function revokeFeedback(uint256 agentId,uint64 feedbackIndex)",
  "event NewFeedback(uint256 indexed agentId,address indexed clientAddress,uint64 feedbackIndex,int128 value,uint8 valueDecimals,string indexed indexedTag1,string tag1,string tag2,string endpoint,string feedbackURI,bytes32 feedbackHash)",
];

export const provider = new JsonRpcProvider(
  process.env.RPC_URL || "https://atlantic.dplabs-internal.com",
  undefined,
  { cacheTimeout: -1, batchMaxCount: 1 },
);
export const identity = new Contract(IDENTITY_ADDRESS, identityAbi, provider);
export const reputation = new Contract(REPUTATION_ADDRESS, reputationAbi, provider);

export async function checkNetwork() {
  const actual = (await provider.getNetwork()).chainId;
  if (actual !== BigInt(CHAIN_ID)) throw new Error(`Expected chain ${CHAIN_ID}, got ${actual}`);
  for (const address of [IDENTITY_ADDRESS, REPUTATION_ADDRESS]) {
    if (await provider.getCode(address) === "0x") throw new Error(`No contract at ${address}`);
  }
  if ((await reputation.getIdentityRegistry()).toLowerCase() !== IDENTITY_ADDRESS.toLowerCase()) {
    throw new Error("Reputation is linked to a different Identity registry");
  }
  if (await identity.getVersion() !== "2.0.0" || await reputation.getVersion() !== "2.0.0") {
    throw new Error("Registry version changed; review the current ABI before continuing");
  }
}

export function walletFromEnv(name) {
  try {
    const key = process.env[name];
    if (!/^0x[0-9a-fA-F]{64}$/.test(key || "")) throw new Error();
    return new Wallet(key, provider);
  } catch {
    throw new Error(`Set a valid ${name} locally in .env`);
  }
}

export function loadAgent() {
  const record = JSON.parse(readFileSync("agent.json", "utf8"));
  if (record.agentRegistry !== AGENT_REGISTRY) throw new Error("agent.json belongs to a different registry");
  return { ...record, agentId: BigInt(record.agentId) };
}

export async function confirmed(tx) {
  console.log(`Submitted: ${tx.hash}`);
  const receipt = await tx.wait(1, 120_000);
  if (!receipt || receipt.status !== 1) throw new Error("Transaction was not confirmed successfully");
  return receipt;
}
```

Review `check.mjs`:

<!-- file: check.mjs -->
```javascript
import { checkNetwork, provider, identity, AGENT_REGISTRY } from "./client.mjs";

try {
  await checkNetwork();
  console.log("Connected:", AGENT_REGISTRY);
  console.log("Contract version:", await identity.getVersion());
  console.log("Registry upgrade administrator:", await identity.owner());
} finally {
  provider.destroy();
}
```

Run it; this step sends no transaction and needs no private key:

```bash
node --env-file=.env check.mjs
```

Expected: the registry identifier above, contract version `2.0.0`, and an administrator address. The registry administrator controls upgrades; it is separate from the owner of your agent NFT.

If a write script later times out, use its printed transaction hash in the explorer before retrying. A timeout is not proof that the transaction failed.

## 3. Register an agent

Review `register.mjs`:

<!-- file: register.mjs -->
```javascript
import { existsSync, writeFileSync } from "node:fs";
import {
  checkNetwork, provider, identity, walletFromEnv, confirmed, AGENT_REGISTRY,
} from "./client.mjs";

try {
  if (existsSync("agent.json")) throw new Error("agent.json already exists; reuse that agent or archive it intentionally");
  await checkNetwork();
  const owner = walletFromEnv("OWNER_PRIVATE_KEY");
  const receipt = await confirmed(await identity.connect(owner)["register()"]());
  const event = receipt.logs.find((log) => log.fragment?.name === "Registered");
  if (!event) throw new Error("Registered event missing; inspect the receipt before retrying");
  const agentId = event.args.agentId;
  writeFileSync("agent.json", JSON.stringify({
    agentId: agentId.toString(),
    agentRegistry: AGENT_REGISTRY,
    owner: owner.address,
    registrationTx: receipt.hash,
  }, null, 2) + "\n", { flag: "wx" });

  // Keep the local recovery record above even if metadata generation fails.
  if (agentId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Use a lossless JSON encoder for this agentId");
  const image = "data:image/svg+xml;base64," + Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#102636"/><text x="28" y="136" fill="white" font-size="28">Pharos Agent</text></svg>',
  ).toString("base64");
  const metadata = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "My Pharos Agent",
    description: "An agent registered on Pharos Atlantic Testnet.",
    image,
    services: [],
    active: false,
    x402Support: false,
    registrations: [{ agentId: Number(agentId), agentRegistry: AGENT_REGISTRY }],
    supportedTrust: ["reputation"],
  };
  writeFileSync("agent-registration.json", JSON.stringify(metadata, null, 2) + "\n");
  console.log("Agent ID:", agentId.toString());
  console.log("Saved agent.json and agent-registration.json; publish metadata next.");
} finally {
  provider.destroy();
}
```

Run:

```bash
node --env-file=.env register.mjs
```

This sends one registration transaction. `agent.json` saves the actual ID and transaction hash; keep it for subsequent steps. The first ID can be **`0`**. Never use a truthiness check such as `if (!agentId)`, predict the next ID, or assume the value returned by a simulation is the ID eventually minted.

At this stage, the NFT exists but its URI is empty. Complete the next step before advertising it as a discoverable agent. Run this script once per intended new identity; running it again is not an update operation.

## 4. Publish the registration metadata

Inspect `agent-registration.json`. The generated file contains your real `agentId` and registry identifier. It starts with no service endpoints and `active: false`, so it does not advertise a working service that you have not built.

For a working agent, edit the name, description, image, and service list, then set `active: true`. For example, use your actual HTTPS endpoints:

```json
{
  "services": [
    { "name": "web", "endpoint": "https://YOUR-DOMAIN.example/" },
    { "name": "MCP", "endpoint": "https://YOUR-DOMAIN.example/mcp" },
    { "name": "A2A", "endpoint": "https://YOUR-DOMAIN.example/.well-known/agent-card.json" }
  ],
  "active": true
}
```

This is a fragment to merge into the generated file, not a replacement for its other fields. Add the protocol `version` your endpoint actually implements where applicable. Set `x402Support: true` only if the service supports x402. Registration does not deploy an MCP server, A2A agent, or payment endpoint.

Review `set-uri.mjs`:

<!-- file: set-uri.mjs -->
```javascript
import { readFileSync } from "node:fs";
import {
  checkNetwork, provider, identity, walletFromEnv, confirmed, loadAgent, AGENT_REGISTRY,
} from "./client.mjs";

try {
  await checkNetwork();
  const { agentId } = loadAgent();
  const metadata = JSON.parse(readFileSync("agent-registration.json", "utf8"));
  if (!metadata.registrations?.some((r) =>
    r.agentRegistry === AGENT_REGISTRY && BigInt(r.agentId) === agentId
  )) throw new Error("Metadata must include this agent's registration");
  const uri = "data:application/json;base64," + Buffer.from(JSON.stringify(metadata)).toString("base64");
  const owner = walletFromEnv("OWNER_PRIVATE_KEY");
  await confirmed(await identity.connect(owner).setAgentURI(agentId, uri));
  console.log("Published metadata for agent", agentId.toString());
  console.log("URI matches:", await identity.tokenURI(agentId) === uri);
} finally {
  provider.destroy();
}
```

Run:

```bash
node --env-file=.env set-uri.mjs
```

The data URI keeps this tutorial self-contained: no IPFS pinning account or web host is required. All JSON in it is public on-chain, and larger content costs more gas. Do not put credentials or private task data in metadata.

For a hosted application, upload the same full JSON to a durable HTTPS URL or IPFS and pass that URL to `setAgentURI` instead. Keep the content available and serve valid JSON. An owner or approved operator can update the URI later; the `agentId` remains the same. If this publication step fails, fix it and rerun `set-uri.mjs` using the saved ID instead of registering another NFT.

## 5. Submit client feedback

Review `feedback.mjs`. The example records **4.5 out of 5** using integer `45`, one decimal place, and tags that describe the scale.

<!-- file: feedback.mjs -->
```javascript
import { existsSync, writeFileSync } from "node:fs";
import { ZeroHash } from "ethers";
import {
  checkNetwork, provider, identity, reputation, walletFromEnv, confirmed, loadAgent,
} from "./client.mjs";

try {
  if (existsSync("feedback.json")) throw new Error("feedback.json already exists; inspect it before submitting another review");
  await checkNetwork();
  const { agentId, agentRegistry } = loadAgent();
  const reviewer = walletFromEnv("REVIEWER_PRIVATE_KEY");
  if (await identity.isAuthorizedOrOwner(reviewer.address, agentId)) {
    throw new Error("Use a reviewer who is neither the agent owner nor an approved operator");
  }
  const receipt = await confirmed(await reputation.connect(reviewer).giveFeedback(
    agentId, 45n, 1, "quality", "stars-5", "", "", ZeroHash,
  ));
  const event = receipt.logs.find((log) => log.fragment?.name === "NewFeedback");
  if (!event) throw new Error("NewFeedback event missing; inspect the receipt before retrying");
  const record = {
    agentId: agentId.toString(), agentRegistry,
    clientAddress: reviewer.address,
    feedbackIndex: event.args.feedbackIndex.toString(),
    transactionHash: receipt.hash,
  };
  writeFileSync("feedback.json", JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
  console.log(record);
} finally {
  provider.destroy();
}
```

Run:

```bash
node --env-file=.env feedback.mjs
```

The reviewer needs native gas but does not need its own registered agent. In this implementation, feedback takes **eight arguments** and no `feedbackAuth` signature. The agent's owner, token-approved address, and approved-for-all operators cannot submit feedback about that agent.

Feedback is not restricted to ratings. `value` can be negative; this deployment limits its absolute integer value to `10^38`, and `valueDecimals` must be `0` through `18`. Agree on units and tag conventions in your application. Feedback indices start at `1` separately for each `(agentId, clientAddress)` pair.

## 6. Read the agent and reputation

Review `read.mjs`:

<!-- file: read.mjs -->
```javascript
import { readFileSync } from "node:fs";
import { formatUnits, getAddress } from "ethers";
import { checkNetwork, provider, identity, reputation, loadAgent } from "./client.mjs";

try {
  await checkNetwork();
  const { agentId, agentRegistry } = loadAgent();
  const record = JSON.parse(readFileSync("feedback.json", "utf8"));
  if (record.agentRegistry !== agentRegistry || BigInt(record.agentId) !== agentId) {
    throw new Error("feedback.json belongs to a different agent");
  }
  const feedback = await reputation.readFeedback(agentId, record.clientAddress, BigInt(record.feedbackIndex));
  // This demo selects its own reviewer; production apps must choose reviewers they trust.
  const trustedReviewers = [...new Set([record.clientAddress].map(getAddress))];
  const summary = await reputation.getSummary(agentId, trustedReviewers, "quality", "stars-5");
  console.log("Agent:", agentRegistry, agentId.toString());
  console.log("NFT owner:", await identity.ownerOf(agentId));
  console.log("Receiving wallet:", await identity.getAgentWallet(agentId));
  console.log("Metadata URI:", await identity.tokenURI(agentId));
  console.log("Review:", formatUnits(feedback.value, feedback.valueDecimals), "out of 5");
  console.log("Revoked:", feedback.isRevoked);
  console.log("Matching review count:", summary.count.toString());
  if (summary.count > 0n) {
    console.log("Summary:", formatUnits(summary.summaryValue, summary.summaryValueDecimals), "out of 5");
  } else {
    console.log("No matching active reviews");
  }
} finally {
  provider.destroy();
}
```

Run:

```bash
node --env-file=.env read.mjs
```

This sends no transaction. After the preceding steps, expect review `4.5`, `Revoked: false`, count `1`, and summary `4.5`. Repeating the registration or review steps intentionally creates additional on-chain records and may change these expectations.

`getSummary` requires a **nonempty list of client addresses**. Your application must choose trusted reviewers and deduplicate the list: the contract does not enforce trust or remove duplicates, so repeated addresses overweight their feedback. It excludes revoked feedback and applies exact tag filters when a tag is nonempty. `getClients(agentId)` discovers submitters; it does not certify that they are trustworthy. Do not turn every discovered address into a trusted reviewer automatically, and do not mix incompatible units in one summary.

For all raw records, `readAllFeedback(agentId, [], "", "", false)` uses all clients while excluding revoked records. Its arrays can become large. With ethers, destructure the returned tuple: its field named `values` conflicts with the JavaScript array method of the same name. Keep IDs and values as `bigint`; use `formatUnits` for display rather than lossy JavaScript floating-point conversion.

## 7. Revoke feedback when needed

Only its original client can revoke a feedback entry. Review `revoke.mjs`:

<!-- file: revoke.mjs -->
```javascript
import { readFileSync } from "node:fs";
import { getAddress } from "ethers";
import {
  checkNetwork, provider, reputation, walletFromEnv, confirmed, loadAgent,
} from "./client.mjs";

try {
  await checkNetwork();
  const { agentId, agentRegistry } = loadAgent();
  const record = JSON.parse(readFileSync("feedback.json", "utf8"));
  const reviewer = walletFromEnv("REVIEWER_PRIVATE_KEY");
  if (record.agentRegistry !== agentRegistry || BigInt(record.agentId) !== agentId ||
      getAddress(record.clientAddress) !== reviewer.address) {
    throw new Error("Use the original reviewer's wallet and matching feedback record");
  }
  await confirmed(await reputation.connect(reviewer).revokeFeedback(agentId, BigInt(record.feedbackIndex)));
  console.log("Feedback revoked; it remains visible in history.");
} finally {
  provider.destroy();
}
```

Optionally run:

```bash
node --env-file=.env revoke.mjs
node --env-file=.env read.mjs
```

For this example, the second command now shows `Revoked: true` and no matching active reviews. Repeating the revocation fails. Revocation does not erase the original transaction or event.

## Manage the agent and its receiving wallet

These addresses have different roles:

| Role | How to read it | What it controls |
| --- | --- | --- |
| Registry administrator | `identity.owner()` or `reputation.owner()` | Upgrades to registry logic |
| Agent NFT owner | `identity.ownerOf(agentId)` | Transfer of that agent and management permissions |
| Approved operator | ERC-721 approval functions | Agent updates authorized by the NFT owner |
| Agent receiving wallet | `identity.getAgentWallet(agentId)` | A verified wallet association; no management permission by itself |

The agent wallet initially equals the registering wallet. Transferring the NFT clears this association; the new owner must set it again. A zero receiving-wallet result is not an existence check: `ownerOf(agentId)` is the appropriate existence/ownership read.

The metadata key `agentWallet` is reserved. Change it through `setAgentWallet`, not `setMetadata`. The new receiving wallet must sign typed data, and the current NFT owner or an approved operator submits the transaction.

### Optional: set a different EOA receiving wallet

Fill `RECEIVING_PRIVATE_KEY` in your local `.env` with the private key of a test wallet you control. This wallet signs an authorization and does not need gas for this step; the owner wallet pays for the transaction. Review `set-wallet.mjs`:

<!-- file: set-wallet.mjs -->
```javascript
import { Contract } from "ethers";
import {
  CHAIN_ID, IDENTITY_ADDRESS, checkNetwork, provider, identity,
  walletFromEnv, confirmed, loadAgent,
} from "./client.mjs";

try {
  await checkNetwork();
  const { agentId } = loadAgent();
  const submitter = walletFromEnv("OWNER_PRIVATE_KEY");
  const receiver = walletFromEnv("RECEIVING_PRIVATE_KEY");
  const currentOwner = await identity.ownerOf(agentId);
  const block = await provider.getBlock("latest");
  if (!block) throw new Error("Latest block unavailable");
  const deadline = BigInt(block.timestamp + 240);
  const signature = await receiver.signTypedData(
    {
      name: "ERC8004IdentityRegistry", version: "1",
      chainId: CHAIN_ID, verifyingContract: IDENTITY_ADDRESS,
    },
    { AgentWalletSet: [
      { name: "agentId", type: "uint256" },
      { name: "newWallet", type: "address" },
      { name: "owner", type: "address" },
      { name: "deadline", type: "uint256" },
    ] },
    { agentId, newWallet: receiver.address, owner: currentOwner, deadline },
  );
  const writable = new Contract(IDENTITY_ADDRESS, [
    "function setAgentWallet(uint256 agentId,address newWallet,uint256 deadline,bytes signature)",
  ], submitter);
  await confirmed(await writable.setAgentWallet(agentId, receiver.address, deadline, signature));
  console.log("Receiving wallet:", await identity.getAgentWallet(agentId));
} finally {
  provider.destroy();
}
```

Run it only when you want to change the wallet:

```bash
node --env-file=.env set-wallet.mjs
```

The EIP-712 domain version is **`"1"`**, even though the registry's contract version is `2.0.0`. The verifying contract is the **Identity proxy**. The typed `owner` field must be the current NFT owner, including when an operator submits the transaction. `signMessage` is not interchangeable with `signTypedData` here.

The contract accepts a deadline between the executing block's timestamp and five minutes after it. The example uses a fresh block timestamp plus four minutes and submits immediately. Generate a new signature if it expires or ownership changes. Smart contract wallets use ERC-1271-compatible signatures through their wallet's signing workflow; the private-key example above is for EOAs.

## Optional: request and record validation

Validation records a request to a nominated validator and that validator's result. It does **not** run the validator, verify a computation, or supply TEE attestations, zero-knowledge proofs, staking, or slashing. The examples below exercise the request/result flow with a demonstration score. A real validator must perform its own checks before responding. This part of ERC-8004 is experimental and continues to evolve upstream.

Use the Validation proxy in the deployment table and the [Validation ABI](abis/erc8004-atlantic-validation-abi.json). It links to the same Identity registry, so reuse the `agent.json` created above. Only the agent's current owner or approved operator can create a request. Only the nominated validator address can respond; this implementation accepts an EOA as well as a contract validator.

For this demo, choose a separate validator wallet and fund it with Atlantic native gas. Fill these optional settings in `.env`, using its public address and private key:

```dotenv
VALIDATOR_ADDRESS=
VALIDATOR_PRIVATE_KEY=
```

The request sender needs only `VALIDATOR_ADDRESS`; the key belongs on the validator's machine. Using separate wallets makes the roles clear, but the registry does not enforce validator independence or reliability. `validation.json` is already excluded by `.gitignore`; retain that file locally for recovery.

Review `validation-client.mjs`:

<!-- file: validation-client.mjs -->
```javascript
import { readFileSync } from "node:fs";
import { Contract, getAddress, keccak256, toUtf8Bytes } from "ethers";
import {
  provider, checkNetwork, IDENTITY_ADDRESS, AGENT_REGISTRY, loadAgent,
} from "./client.mjs";

export const VALIDATION_ADDRESS = "0x45983Ead2B48e69d57689ffdc6AE648482766537";
export const validation = new Contract(VALIDATION_ADDRESS, [
  "function getIdentityRegistry() view returns (address)",
  "function getVersion() pure returns (string)",
  "function validationRequest(address validatorAddress,uint256 agentId,string requestURI,bytes32 requestHash)",
  "function validationResponse(bytes32 requestHash,uint8 response,string responseURI,bytes32 responseHash,string tag)",
  "function getValidationStatus(bytes32 requestHash) view returns (address validatorAddress,uint256 agentId,uint8 response,bytes32 responseHash,string tag,uint256 lastUpdate)",
  "function getSummary(uint256 agentId,address[] validatorAddresses,string tag) view returns (uint64 count,uint8 avgResponse)",
], provider);

export async function checkValidation() {
  await checkNetwork();
  if (await provider.getCode(VALIDATION_ADDRESS) === "0x") throw new Error("Validation registry is missing");
  if (await validation.getIdentityRegistry() !== IDENTITY_ADDRESS || await validation.getVersion() !== "2.0.0") {
    throw new Error("Validation registry linkage or version changed");
  }
}

export function loadValidation() {
  const { agentId } = loadAgent();
  const record = JSON.parse(readFileSync("validation.json", "utf8"));
  const request = JSON.parse(record.requestJson);
  if (record.validationRegistry !== VALIDATION_ADDRESS || request.agentRegistry !== AGENT_REGISTRY ||
      BigInt(request.agentId) !== agentId || keccak256(toUtf8Bytes(record.requestJson)) !== record.requestHash) {
    throw new Error("Validation record belongs to a different agent/registry or its bytes changed");
  }
  return {
    agentId, requestHash: record.requestHash,
    validatorAddress: getAddress(request.validatorAddress),
    requestURI: "data:application/json;base64," + Buffer.from(record.requestJson).toString("base64"),
  };
}
```

Review `validation-request.mjs`. The hash must be unique across this entire Validation registry, not just within one agent. Hash the exact request JSON bytes and include a random nonce and full agent identity so separate requests do not reuse a hash.

<!-- file: validation-request.mjs -->
```javascript
import { existsSync, writeFileSync } from "node:fs";
import { getAddress, hexlify, randomBytes, keccak256, toUtf8Bytes, ZeroAddress } from "ethers";
import { provider, walletFromEnv, confirmed, loadAgent, AGENT_REGISTRY } from "./client.mjs";
import { validation, VALIDATION_ADDRESS, checkValidation, loadValidation } from "./validation-client.mjs";

try {
  if (existsSync("validation.json")) throw new Error("validation.json already exists; inspect its request before creating another");
  await checkValidation();
  const { agentId } = loadAgent();
  const owner = walletFromEnv("OWNER_PRIVATE_KEY");
  const validatorAddress = getAddress(process.env.VALIDATOR_ADDRESS);
  if (validatorAddress === ZeroAddress || validatorAddress === owner.address) {
    throw new Error("Choose a separate, nonzero validator address for this demo");
  }
  const requestJson = JSON.stringify({
    agentRegistry: AGENT_REGISTRY, agentId: agentId.toString(), validatorAddress,
    nonce: hexlify(randomBytes(32)), task: "Demonstrate the validation request/result flow",
  });
  const requestHash = keccak256(toUtf8Bytes(requestJson));
  // Save the exact bytes and hash before any transaction is sent.
  writeFileSync("validation.json", JSON.stringify({
    validationRegistry: VALIDATION_ADDRESS, requestHash, requestJson,
  }, null, 2) + "\n", { flag: "wx" });
  console.log("Saved request:", requestHash);
  const { requestURI } = loadValidation();
  await confirmed(await validation.connect(owner).validationRequest(
    validatorAddress, agentId, requestURI, requestHash,
  ));
} finally {
  provider.destroy();
}
```

Run the request with the owner/operator wallet:

```bash
node --env-file=.env validation-request.mjs
```

The data URI makes the sample request public and self-contained. For real requests, publish appropriate nonsecret evidence at a durable URI and hash the exact published bytes. The contract stores the supplied hash but does not fetch the URI or check its content against that hash.

If the transaction fails or times out, keep `validation.json` and inspect the printed transaction hash before retrying. The saved request hash lets you query the request even if the original process exits. An `exists` revert means that hash is already registered; do not silently replace it with a new request. An `unknown` status alone does not prove a pending transaction will never confirm.

Use `validation-response.mjs` on the validator's machine, with the same `agent.json` and `validation.json` (neither contains a private key):

<!-- file: validation-response.mjs -->
```javascript
import { keccak256, toUtf8Bytes } from "ethers";
import { provider, walletFromEnv, confirmed } from "./client.mjs";
import { validation, checkValidation, loadValidation } from "./validation-client.mjs";

try {
  await checkValidation();
  const { agentId, requestHash, validatorAddress } = loadValidation();
  const validator = walletFromEnv("VALIDATOR_PRIVATE_KEY");
  const status = await validation.getValidationStatus(requestHash);
  if (validator.address !== validatorAddress || status.validatorAddress !== validator.address || status.agentId !== agentId) {
    throw new Error("This wallet is not the nominated validator for the saved request");
  }
  const response = 100; // Demonstration score; replace with the validator's actual assessment.
  const responseJson = JSON.stringify({
    requestHash, response, description: "Demo response; no independent verification performed",
  });
  const responseURI = "data:application/json;base64," + Buffer.from(responseJson).toString("base64");
  await confirmed(await validation.connect(validator).validationResponse(
    requestHash, response, responseURI, keccak256(toUtf8Bytes(responseJson)), "demo",
  ));
} finally {
  provider.destroy();
}
```

```bash
node --env-file=.env validation-response.mjs
```

The response is a `uint8` score from **0 through 100**. Only the nominated validator may post it. That validator can respond again to update the current score, hash, and tag; every response remains in event history.

Use `validation-read.mjs` for a read-only check:

<!-- file: validation-read.mjs -->
```javascript
import { provider } from "./client.mjs";
import { validation, checkValidation, loadValidation } from "./validation-client.mjs";

try {
  await checkValidation();
  const { agentId, requestHash, validatorAddress } = loadValidation();
  const status = await validation.getValidationStatus(requestHash);
  const summary = await validation.getSummary(agentId, [validatorAddress], "");
  console.log("Request:", requestHash);
  console.log("Nominated validator:", status.validatorAddress);
  console.log("Stored response:", status.response.toString(), "(zero alone does not mean pending)");
  console.log("Tag:", status.tag);
  console.log("Answered requests for this agent/validator:", summary.count.toString());
  if (summary.count > 0n) console.log("Average response:", summary.avgResponse.toString());
} finally {
  provider.destroy();
}
```

```bash
node --env-file=.env validation-read.mjs
```

`getValidationStatus` returns response `0` both before a response and after a valid zero score; it does not expose the stored `hasResponse` flag. Track `ValidationResponse` events for the specific request hash to distinguish these cases. `getSummary` excludes unanswered requests, but its count covers all matching requests, not just the saved one. For this first request, expect count `0` before the response, then count `1` and average `100` after the sample response.

Unlike Reputation's summary, Validation's `getSummary(agentId, [], "")` includes all validators. Select validators your application trusts. Neither the score nor the number of responses proves independent validation occurred.

## Integrate an application, SDK, or browser wallet

For any SDK or language, configure chain `688689`, the Atlantic RPC, the registry **proxy** addresses used by your application, and the corresponding ABIs. Use explicit custom-registry options where the SDK provides them. If an SDK only supports predefined official deployments, call these contracts directly with ethers, viem, web3.py, or another EVM library using the downloaded ABIs.

For a browser application:

1. Add/select Atlantic in the user's wallet with the network settings above. `wallet_switchEthereumChain` uses chain ID `0xa8231`.
2. Obtain the signer from the injected wallet provider, for example ethers' `BrowserProvider`, and confirm its chain ID before every write flow.
3. Connect an Identity, Reputation, or Validation contract instance to that signer as needed. Use the same function arguments and receipt events as the Node examples.
4. Let the user approve each transaction or typed-data signature in their wallet. Keep private-key environment files on the server or local development machine; do not include them in browser code.
5. Save the full registry identifier with every agent ID. A chain ID alone is not enough when a chain has multiple registries.

For contract-to-contract integration, use Solidity interfaces matching the downloaded ABI. `ownerOf(agentId)` verifies existence and returns the owner. Avoid treating a metadata claim or an aggregate score as an authorization check.

### Main contract interfaces

Use the full downloaded ABIs for methods not included in `client.mjs`. `agentId` is `uint256`; feedback indices are `uint64`. All writes require native gas.

| Identity method | Purpose / caller |
| --- | --- |
| `register()` | Register first, then publish a URI containing the returned ID |
| `register(string agentURI)` | Register with an already prepared URI |
| `register(string agentURI, (string metadataKey, bytes metadataValue)[] metadata)` | Register with additional on-chain metadata |
| `ownerOf(uint256 agentId)` | Read the NFT owner; reverts if the agent does not exist |
| `tokenURI(uint256 agentId)` | Read the registration-file URI |
| `setAgentURI(uint256 agentId, string newURI)` | Owner or approved operator updates the URI |
| `getMetadata(uint256 agentId, string metadataKey)` | Read metadata bytes |
| `setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)` | Owner/operator writes metadata, excluding reserved `agentWallet` |
| `getAgentWallet(uint256 agentId)` | Read the receiving-wallet association |
| `setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)` | Owner/operator submits proof signed by the new wallet |
| `unsetAgentWallet(uint256 agentId)` | Owner/operator clears the wallet association |
| `isAuthorizedOrOwner(address spender, uint256 agentId)` | Check whether an address may manage an existing agent |
| ERC-721 `approve`, `setApprovalForAll`, `safeTransferFrom` | Delegate management or transfer ownership; transfer clears `agentWallet` |

| Reputation method | Purpose / caller |
| --- | --- |
| `getIdentityRegistry()` | Read which Identity proxy this registry uses |
| `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)` | Client posts a signal; owner/operators of the target agent are excluded |
| `readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)` | Read value, decimals, tags, and revocation status |
| `getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2)` | Aggregate active matching feedback from specified trusted reviewers |
| `getClients(uint256 agentId)` | Discover feedback submitters |
| `getLastIndex(uint256 agentId, address clientAddress)` | Read this client's most recent feedback index, or `0` if none |
| `readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked)` | Read arrays of raw feedback; empty client list selects all clients |
| `revokeFeedback(uint256 agentId, uint64 feedbackIndex)` | Original client marks its feedback revoked |
| `appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string responseURI, bytes32 responseHash)` | Anyone appends a response to existing feedback; URI must be nonempty |
| `getResponseCount(uint256 agentId, address clientAddress, uint64 feedbackIndex, address[] responders)` | Count appended responses, optionally filtered by responder |

| Validation method | Purpose / caller |
| --- | --- |
| `getIdentityRegistry()` | Read the linked Identity proxy |
| `validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)` | Agent owner/operator creates a request with a registry-wide unique hash |
| `validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)` | Nominated validator posts or updates a score from 0 through 100 |
| `getValidationStatus(bytes32 requestHash)` | Read validator, agent ID, response, response hash, tag, and last-update timestamp; unknown hashes revert |
| `getSummary(uint256 agentId, address[] validatorAddresses, string tag)` | Count answered matching requests and their integer average; an empty validator list includes all validators |
| `getAgentValidations(uint256 agentId)` | List request hashes for an agent, including unanswered requests |
| `getValidatorRequests(address validatorAddress)` | List request hashes nominated to a validator, including unanswered requests |

No application needs to call `initialize`, `upgradeToAndCall`, or registry `transferOwnership` to register or review an agent. Those are deployment/administration operations.

### Rich feedback and responses

The quickstart uses empty optional strings and a zero hash. To attach evidence, publish a feedback JSON file and pass its URI and, where appropriate, the Keccak-256 hash of its **exact published bytes**. Include the agent registry, agent ID, client address, creation time, value, and decimal scale as described in the [feedback-file specification](https://eips.ethereum.org/EIPS/eip-8004#off-chain-feedback-file-structure).

For a local UTF-8 file, ethers' `keccak256(readFileSync("feedback-details.json"))` hashes the bytes directly. Do not hash a JSON object after reformatting it and expect it to match an earlier upload. A content-addressed IPFS URI may use a zero hash where the specification allows it.

A response is additional context, not a replacement for the original feedback. Anyone can append one, including to revoked feedback. Record the responder address and evaluate its authority separately. The registry emits response URIs/hashes; it does not store the response text.

### Agent service discovery

The registration file advertises endpoints. Consumers resolve `tokenURI(agentId)`, parse its JSON, and check the matching registration entry. For HTTPS domain control, a service may publish `/.well-known/agent-registration.json` containing its `registrations` entries. Match the full registry identifier and ID, not just the agent's display name. See [endpoint domain verification](https://eips.ethereum.org/EIPS/eip-8004#endpoint-domain-verification-optional).

Treat metadata and endpoint URLs as untrusted input. For a server-side fetcher, bound response sizes and request time, restrict supported schemes, and prevent access to private/internal network addresses. A declared capability or verified domain is not a guarantee of the quality of work.

Payments are separate from ERC-8004. To add paid endpoints, follow the [Pharos x402 guide](https://docs.pharos.xyz/developer-guide/x402/x402-atlantic-testnet) and advertise only payment features the service actually supports.

## Build an indexer or directory

Index logs emitted at the **proxy** addresses. Start at or before these proxy creation blocks:

| Registry | Start block | Useful events |
| --- | --- | --- |
| Identity | `32984647` | `Registered`, `URIUpdated`, `MetadataSet`, `Transfer`, `Approval`, `ApprovalForAll` |
| Reputation | `32984672` | `NewFeedback`, `FeedbackRevoked`, `ResponseAppended` |
| Validation | `32985033` | `ValidationRequest`, `ValidationResponse` |

A basic indexer can use `eth_getLogs` or an EVM library's event-query API with the downloaded ABIs:

1. Scan bounded block ranges and persist the last processed block. Reduce the range and retry with backoff when the provider limits a request.
2. Key agents by `(chainId, identityProxy, agentId)`, feedback by `(chainId, reputationProxy, agentId, clientAddress, feedbackIndex)`, and logs by their chain/block/transaction/log position.
3. Process `URIUpdated` and NFT `Transfer` events as well as registrations; ownership, metadata, and wallet associations can change.
4. Apply `FeedbackRevoked` without deleting the original review, and retain response events with their responder addresses.
5. Retain block hashes, use an appropriate confirmation policy, and replay affected ranges after a reorganization. WebSocket notifications should be backed by a recoverable historical scan.

`NewFeedback` carries the endpoint, feedback URI, and feedback hash. These fields are **not returned by `readFeedback`**, so preserve the events if your UI needs them. The indexed string `indexedTag1` is a hash; use the accompanying nonindexed `tag1` for display. Similarly, `MetadataSet` includes the readable metadata key alongside its indexed hash.

Key validation requests by `(chainId, validationProxy, requestHash)`. Preserve the URI from `ValidationRequest` and the URI/hash/score from each `ValidationResponse`; status reads do not return the URIs. A response event marks a request answered even when its score is zero. Later responses update the current result, so retain their history rather than treating repeated hashes as duplicate logs.

There is no ERC-721 enumerable `totalSupply`/`tokenByIndex` interface in this implementation. Discover registrations from events. Aggregate read methods are not paginated; use an indexer for large datasets rather than repeatedly requesting unbounded arrays.

An upstream agent explorer or SDK will not necessarily index this independent deployment automatically. Direct contract calls work with the settings above; third-party discovery requires support for these addresses.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| RPC URL returns an error when opened in a browser | It is a JSON-RPC endpoint. Use the POST request below or `check.mjs`. |
| `Expected chain 688689` / wallet balance appears zero | Confirm the selected network and where the funding transaction landed. |
| `No contract at ...` | Use Atlantic and the exact proxy addresses in this guide. |
| `insufficient funds` | Fund the wallet that submits that transaction with Atlantic native test gas. |
| `agent.json already exists` | Reuse the saved agent. Archive the file only when a new identity is intentional. |
| Agent ID is `0` | This is valid; use bigint and explicit null/undefined checks. |
| `ERC721NonexistentToken` | Check the ID, Identity registry address, and chain; the same ID elsewhere is unrelated. |
| `Self-feedback not allowed` | Use a reviewer who is neither the agent owner nor one of its approved operators. |
| `clientAddresses required` | Supply a nonempty, deduplicated trusted reviewer list to `getSummary`. |
| `Not authorized` on an update | Use the current NFT owner or an approved operator. Being the receiving wallet is insufficient. |
| Wallet-signature errors | Check domain version `1`, chain, proxy address, current NFT owner, new-wallet signer, and deadline. |
| `reserved key` | Use `setAgentWallet` or `unsetAgentWallet` for `agentWallet`. |
| `Already revoked` | The review was already revoked; read its current status. |
| Validation `exists` | That request hash is already used in this registry; inspect the original request and transaction. |
| Validation `unknown` | Check the request hash, Validation proxy, network, and request transaction receipt. |
| Validation `not validator` | Only the validator nominated in the request may respond. |
| Validation `resp>100` | Use an integer score between 0 and 100. |
| A write times out | Check its receipt/nonce before retrying; it may already have confirmed. |
| SDK returns no agents | Confirm it supports this chain and the custom registry addresses your application uses. |

For a direct network check:

```bash
curl https://atlantic.dplabs-internal.com \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

Expected result: `"0xa8231"`. This confirms the RPC network; it does not request faucet funds.

To check a wallet balance, replace the placeholder with your own address:

```bash
curl https://atlantic.dplabs-internal.com \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["YOUR_WALLET_ADDRESS","latest"]}'
```

The result is a hexadecimal wei amount; `0x0` means zero. Native token balances use 18 decimals. A successful balance query does not guarantee the balance covers every transaction you plan to send.

## Deployment details and source references

This guide targets the deployed implementation at upstream commit [`b9e466c250744a7e06b13dff9d3c2844ed64f825`](https://github.com/erc-8004/erc-8004-contracts/tree/b9e466c250744a7e06b13dff9d3c2844ed64f825), with Solidity `0.8.24`, OpenZeppelin `5.4.0`, optimizer 200 runs, and `viaIR`. The build targets Paris to avoid requiring `PUSH0`. The contracts use UUPS proxies and can be upgraded by their administrator; a future upgrade may require revised ABIs or integration behavior.

| Deployment detail | Address |
| --- | --- |
| Identity implementation — use the proxy for application calls | [0x69A1a21D01dB4707807a195cb4FFcb83cfD936ae](https://atlantic.pharosscan.xyz/address/0x69A1a21D01dB4707807a195cb4FFcb83cfD936ae) |
| Reputation implementation — use the proxy for application calls | [0xe962F43748C922B672a0AbB418b2D11b7CF7cb4c](https://atlantic.pharosscan.xyz/address/0xe962F43748C922B672a0AbB418b2D11b7CF7cb4c) |
| Validation implementation — use the proxy for application calls | [0xC26C8c3f25ca916F523c59dF2Ddd0A473Bb07150](https://atlantic.pharosscan.xyz/address/0xC26C8c3f25ca916F523c59dF2Ddd0A473Bb07150) |
| Upgrade administrator at deployment | [0x741C6A799398280Df46dEb34cF0486dbDC0FB69f](https://atlantic.pharosscan.xyz/address/0x741C6A799398280Df46dEb34cF0486dbDC0FB69f) |

The deployment receipts and on-chain ownership/linkage checks succeeded. All three registry proxies are initialized; Reputation and Validation reference the Identity proxy above. Validation was added without replacing the existing Identity or Reputation registries. Explorer source verification has not been completed. Do not infer an audit or a stable mainnet deployment from these testnet addresses.

Use the [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004) for the protocol and the pinned [Identity source](https://github.com/erc-8004/erc-8004-contracts/blob/b9e466c250744a7e06b13dff9d3c2844ed64f825/contracts/IdentityRegistryUpgradeable.sol), [Reputation source](https://github.com/erc-8004/erc-8004-contracts/blob/b9e466c250744a7e06b13dff9d3c2844ed64f825/contracts/ReputationRegistryUpgradeable.sol), and [Validation source](https://github.com/erc-8004/erc-8004-contracts/blob/b9e466c250744a7e06b13dff9d3c2844ed64f825/contracts/ValidationRegistryUpgradeable.sol) for implementation-specific behavior. ERC-8004 remains a draft; the deployed source takes precedence when a newer tutorial describes a different interface. The examples use [ethers v6](https://docs.ethers.org/v6/).


## Repository layout

| Path | Contents |
| --- | --- |
| [examples/node-agent/](examples/node-agent/) | Runnable Node.js integration example and offline checks |
| [abis/](abis/) | Full ABIs for the three deployed registry implementations |
| [deployments/atlantic.json](deployments/atlantic.json) | Public chain settings, proxy/implementation addresses, and indexing start blocks |
| [NOTICE.md](NOTICE.md) | Upstream references and attribution |

This repository integrates with the existing registries. It does not deploy registry contracts or run an agent model/service. Replace the sample metadata and endpoints with your own agent's details.

The example uses ethers `6.17.0`. Its write flows were exercised on an isolated local EVM using the pinned contracts; live checks against Atlantic were read-only. Validation is an experimental request/result interface.

The guide and example are available under the [MIT license](LICENSE).
