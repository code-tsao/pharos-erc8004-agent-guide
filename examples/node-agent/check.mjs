import { checkNetwork, provider, identity, AGENT_REGISTRY } from "./client.mjs";

try {
  await checkNetwork();
  console.log("Connected:", AGENT_REGISTRY);
  console.log("Contract version:", await identity.getVersion());
  console.log("Registry upgrade administrator:", await identity.owner());
} finally {
  provider.destroy();
}
