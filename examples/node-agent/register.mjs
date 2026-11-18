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
