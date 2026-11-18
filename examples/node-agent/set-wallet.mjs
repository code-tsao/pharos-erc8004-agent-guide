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
