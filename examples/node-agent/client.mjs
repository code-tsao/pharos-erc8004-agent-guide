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
