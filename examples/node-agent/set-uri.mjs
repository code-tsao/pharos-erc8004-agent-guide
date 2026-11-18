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
