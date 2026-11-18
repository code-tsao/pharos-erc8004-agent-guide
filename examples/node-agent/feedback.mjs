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
